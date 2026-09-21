import { useMemo, useState, useEffect, useRef } from 'react'
import { marked } from 'marked'
import { joinClasses } from '../../ui/classNames'
import { fillEmptyImagesFromWorkspace, embedImagesInMarkdown } from '../../../utils/resolveImagePath'
import { injectMissingImageSources } from '../../../utils/generatedImageRegistry'

export interface MarkdownRendererProps {
  content: string
  className?: string
}

const openExternalLink = (href: string) => {
  if (!href) return
  if (href.startsWith('http://') || href.startsWith('https://')) {
    window.electronAPI?.shell?.openExternal(href).catch((err: Error) => {
      console.error('Failed to open external URL:', err)
    })
  }
}

function htmlImgToMarkdown(content: string): string {
  return content
    .replace(/<img[^>]+src=["']?([^"'\s>]+)["']?[^>]*alt=["']?([^"'\s>]*)["']?[^>]*>/gi, '![$2]($1)')
    .replace(/<img[^>]+alt=["']?([^"'\s>]*)["']?[^>]*src=["']?([^"'\s>]+)["']?[^>]*>/gi, '![$1]($2)')
    .replace(/<img[^>]+src=["']?([^"'\s>]+)["']?[^>]*>/gi, '![]($1)')
}

/**
 * Add Smile UI classes to the HTML produced by marked's default renderer.
 * Using the default renderer means inline content (images, links, emphasis)
 * is already rendered correctly; we just need to attach our CSS hooks.
 */
function addUiClasses(html: string): string {
  if (typeof DOMParser === 'undefined') {
    // Fallback for non-browser environments (tests / SSR). The default marked
    // output still renders images correctly; styling is a browser concern.
    return html
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const body = doc.body

  const add = (selector: string, className: string) => {
    body.querySelectorAll(selector).forEach(el => {
      const existing = el.getAttribute('class') || ''
      const next = existing ? `${existing} ${className}` : className
      el.setAttribute('class', next)
    })
  }

  add('h1', 'ui-md-h1')
  add('h2', 'ui-md-h2')
  add('h3', 'ui-md-h3')
  add('h4', 'ui-md-h4')
  add('h5', 'ui-md-h5')
  add('h6', 'ui-md-h6')
  add('p', 'ui-md-p')
  add('ul', 'ui-md-list')
  add('ol', 'ui-md-list ui-md-list--ordered')
  add('li', 'ui-md-li')
  add('blockquote', 'ui-md-blockquote')
  add('hr', 'ui-md-hr')
  add('table', 'ui-md-table')
  add('img', 'ui-md-image')
  add('a', 'ui-md-link')

  // Code blocks: pre gets ui-md-pre; keep any language-* class on code.
  body.querySelectorAll('pre').forEach(pre => {
    const existing = pre.getAttribute('class') || ''
    pre.setAttribute('class', existing ? `${existing} ui-md-pre` : 'ui-md-pre')
    const code = pre.querySelector('code')
    if (code) {
      const codeClass = code.getAttribute('class') || ''
      code.setAttribute('class', codeClass ? `${codeClass} ui-md-code` : 'ui-md-code')
      const lang = codeClass.match(/language-(\S+)/)?.[1]
      if (lang && !pre.hasAttribute('data-language')) {
        pre.setAttribute('data-language', lang)
      }
    }
  })

  // Inline code spans.
  body.querySelectorAll('code').forEach(code => {
    if (code.closest('pre')) return // already handled above
    const existing = code.getAttribute('class') || ''
    code.setAttribute('class', existing ? `${existing} ui-md-code` : 'ui-md-code')
  })

  // Wrap tables in a scrollable container.
  body.querySelectorAll('table').forEach(table => {
    if (table.parentElement?.classList.contains('ui-md-table-wrap')) return
    const wrapper = doc.createElement('div')
    wrapper.className = 'ui-md-table-wrap'
    table.parentNode?.insertBefore(wrapper, table)
    wrapper.appendChild(table)
  })

  // Lazy-load images by default.
  body.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('loading')) {
      img.setAttribute('loading', 'lazy')
    }
  })

  return body.innerHTML
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const [asyncContent, setAsyncContent] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const preloaded = useMemo(() => {
    const withUnixLineEndings = content.replace(/\r\n/g, '\n')
    const withInjectedImages = injectMissingImageSources(withUnixLineEndings)
    return htmlImgToMarkdown(withInjectedImages)
  }, [content])

  useEffect(() => {
    let cancelled = false
    fillEmptyImagesFromWorkspace(preloaded)
      .then(filled => embedImagesInMarkdown(filled))
      .then(embedded => {
        if (!cancelled) {
          const dataUrlCount = (embedded.match(/data:image\//g) || []).length
          console.log('[MarkdownRenderer] Embedded', dataUrlCount, 'images')
          setAsyncContent(embedded)
        }
      })
      .catch(err => {
        console.error('[MarkdownRenderer] Failed to embed images:', err)
        if (!cancelled) setAsyncContent(preloaded)
      })
    return () => { cancelled = true }
  }, [preloaded])

  // Intercept external link clicks inside the rendered HTML.
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (anchor && anchor.href) {
      if (anchor.href.startsWith('http://') || anchor.href.startsWith('https://')) {
        event.preventDefault()
        openExternalLink(anchor.href)
      }
    }
  }

  // Use marked's default renderer so inline content (images, links, formatting)
  // is parsed correctly, then inject our CSS classes via the DOM.
  const html = useMemo(() => {
    const source = asyncContent ?? preloaded
    const raw = marked.parse(source, { gfm: true, breaks: false }) as string
    return addUiClasses(raw)
  }, [asyncContent, preloaded])

  return (
    <div
      ref={containerRef}
      className={joinClasses('ui-md', className)}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
