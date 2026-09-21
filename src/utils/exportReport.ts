import { marked } from 'marked'
import { markdownToDocxBlob } from './markdownToDocx'
import { fillEmptyImagesFromWorkspace, embedImagesInMarkdown } from './resolveImagePath'
import { injectMissingImageSources } from './generatedImageRegistry'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, '-').trim() || 'report'
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function exportReportAsDocx(content: string, title: string, path: string) {
  const base = sanitizeFilename(title || path.split('/').pop() || 'report')
  const injected = injectMissingImageSources(content || '')
  const filled = await fillEmptyImagesFromWorkspace(injected)
  const embedded = await embedImagesInMarkdown(filled)
  const blob = await markdownToDocxBlob(embedded, title)
  downloadBlob(blob, `${base}.docx`)
}

export async function exportReportAsPdf(content: string, title: string, path: string) {
  const base = sanitizeFilename(title || path.split('/').pop() || 'report')
  const injected = injectMissingImageSources(content || '')
  const filled = await fillEmptyImagesFromWorkspace(injected)
  const embedded = await embedImagesInMarkdown(filled || '<p>(empty report)</p>')
  const htmlBody = marked.parse(embedded, { gfm: true }) as string

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page { margin: 8mm; }
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.55;
          color: #111827;
          padding: 8mm;
          margin: 0;
        }
        h1 { font-size: 20pt; font-weight: 600; margin: 0 0 12pt; }
        h2 { font-size: 16pt; font-weight: 600; margin: 16pt 0 8pt; }
        h3 { font-size: 13pt; font-weight: 600; margin: 12pt 0 6pt; }
        p { margin: 0 0 8pt; }
        ul, ol { margin: 0 0 8pt 18pt; padding-left: 0; }
        li { margin-bottom: 2pt; }
        code {
          font-family: Menlo, Monaco, Consolas, monospace;
          background: #f3f4f6;
          padding: 1pt 3pt;
          border-radius: 2pt;
          font-size: 0.9em;
        }
        pre {
          background: #f3f4f6;
          padding: 8pt;
          border-radius: 4pt;
          white-space: pre-wrap;
          margin: 8pt 0;
        }
        pre code { background: transparent; padding: 0; }
        table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
        th, td {
          border: 1pt solid #d1d5db;
          padding: 4pt 6pt;
          text-align: left;
          vertical-align: top;
        }
        th { background: #f9fafb; font-weight: 600; }
        blockquote {
          border-left: 3pt solid #d1d5db;
          padding-left: 10pt;
          margin: 8pt 0;
          color: #4b5563;
        }
        a { color: #2563eb; text-decoration: underline; }
        hr { border: none; border-top: 1pt solid #e5e7eb; margin: 10pt 0; }
        img { max-width: 100%; height: auto; display: block; margin: 8pt 0; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <p style="color:#6b7280;font-size:9pt;margin-bottom:16pt;">${escapeHtml(path)}</p>
      ${htmlBody}
    </body>
    </html>
  `

  const result = await window.electronAPI.file.exportPdf(html, `${base}.pdf`)
  if (!result.success) {
    throw new Error(result.error || 'PDF export failed')
  }
  if (!result.data) {
    throw new Error('PDF export returned no data')
  }

  const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0))
  downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${base}.pdf`)
}
