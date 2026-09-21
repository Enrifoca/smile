import mermaid from 'mermaid'
import type { MermaidConfig } from 'mermaid'

export type DiagramType = 'mermaid'

export interface DiagramRenderOptions {
  type: DiagramType
  source: string
  title?: string
}

const MERMAID_THEME: MermaidConfig = {
  theme: 'base',
  themeVariables: {
    primaryColor: '#eff6ff',
    primaryTextColor: '#111827',
    primaryBorderColor: '#2563eb',
    lineColor: '#6b7280',
    secondaryColor: '#f3f4f6',
    tertiaryColor: '#ffffff',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
  },
}

let mermaidInitialized = false

function ensureMermaidInitialized(): void {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    ...MERMAID_THEME,
    securityLevel: 'strict',
    htmlLabels: true,
  })
  mermaidInitialized = true
}

function sanitizeMermaidSource(source: string): string {
  let sanitized = source.trim()
  // If the source is wrapped in a markdown fence, strip it.
  if (sanitized.startsWith('```')) {
    sanitized = sanitized.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
  }
  // Ensure a diagram type directive exists; default to flowchart if none.
  const hasDirective = /^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|requirementDiagram|gitgraph|C4Context|mindmap|timeline|quadrantChart|xychart-beta)\b/im.test(sanitized)
  if (!hasDirective) {
    sanitized = `flowchart TD\n${sanitized}`
  }
  return sanitized
}

export async function renderDiagramToPng(options: DiagramRenderOptions): Promise<string> {
  ensureMermaidInitialized()

  const source = sanitizeMermaidSource(options.source)
  const id = `mermaid-diagram-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

  return new Promise((resolve, reject) => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.top = '-9999px'
    document.body.appendChild(container)

    const cleanup = () => {
      if (container.parentNode) container.parentNode.removeChild(container)
    }

    mermaid
      .render(id, source, container)
      .then(({ svg }) => {
        try {
          const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
          const url = URL.createObjectURL(svgBlob)
          const img = new Image()
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas')
              // Use a reasonable default size; scale up for retina.
              const scale = 2
              canvas.width = Math.max(img.naturalWidth, 400) * scale
              canvas.height = Math.max(img.naturalHeight, 300) * scale
              const ctx = canvas.getContext('2d')
              if (!ctx) {
                URL.revokeObjectURL(url)
                cleanup()
                reject(new Error('Could not get canvas context'))
                return
              }
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
              URL.revokeObjectURL(url)
              const dataUrl = canvas.toDataURL('image/png')
              cleanup()
              resolve(dataUrl)
            } catch (err) {
              URL.revokeObjectURL(url)
              cleanup()
              reject(err)
            }
          }
          img.onerror = () => {
            URL.revokeObjectURL(url)
            cleanup()
            reject(new Error('Failed to load rendered SVG'))
          }
          img.src = url
        } catch (err) {
          cleanup()
          reject(err)
        }
      })
      .catch(err => {
        cleanup()
        reject(err)
      })
  })
}
