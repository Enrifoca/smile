import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { joinClasses } from '../../ui/classNames'

export interface MarkdownRendererProps {
  content: string
  className?: string
}

const CODE_BLOCK_CLASS = /language-(\w+)/

const openExternalLink = (href: string) => {
  if (!href) return
  if (href.startsWith('http://') || href.startsWith('https://')) {
    window.electronAPI?.shell?.openExternal(href).catch((err: Error) => {
      console.error('Failed to open external URL:', err)
    })
  }
}

const components: Components = {
  h1: ({ children }) => <h1 className="ui-md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="ui-md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="ui-md-h3">{children}</h3>,
  p: ({ children }) => <p className="ui-md-p">{children}</p>,
  ul: ({ children }) => <ul className="ui-md-list">{children}</ul>,
  ol: ({ children }) => <ol className="ui-md-list ui-md-list--ordered">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="ui-md-link"
      onClick={event => {
        event.preventDefault()
        openExternalLink(href ?? '')
      }}
    >
      {children}
    </a>
  ),
  code(props) {
    const { className, children } = props
    const inline = (props as { inline?: boolean }).inline
    const language = className?.match(CODE_BLOCK_CLASS)?.[1] ?? ''
    if (inline) {
      return <code className="ui-md-code">{children}</code>
    }
    return (
      <pre className="ui-md-pre" data-language={language || undefined}>
        <code className={joinClasses('ui-md-code', className)}>{children}</code>
      </pre>
    )
  },
  table: ({ children }) => (
    <div className="ui-md-table-wrap">
      <table className="ui-md-table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  blockquote: ({ children }) => <blockquote className="ui-md-blockquote">{children}</blockquote>,
  hr: () => <hr className="ui-md-hr" />,
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const normalized = useMemo(() => content.replace(/\r\n/g, '\n'), [content])

  return (
    <div className={joinClasses('ui-md', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {normalized}
      </ReactMarkdown>
    </div>
  )
}
