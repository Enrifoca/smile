import { jsPDF } from 'jspdf'
import { marked } from 'marked'
import html2canvas from 'html2canvas'
import { markdownToDocxBlob } from './markdownToDocx'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
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
  const blob = await markdownToDocxBlob(content || '', title)
  downloadBlob(blob, `${base}.docx`)
}

export async function exportReportAsPdf(content: string, title: string, path: string) {
  const base = sanitizeFilename(title || path.split('/').pop() || 'report')
  const html = marked.parse(content || '<p>(empty report)</p>', { gfm: true }) as string

  const container = document.createElement('div')
  container.innerHTML = `
    <style>
      @page { margin: 15mm; }
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.55; color: #111827; }
      h1 { font-size: 20pt; font-weight: 600; margin: 0 0 12pt; }
      h2 { font-size: 16pt; font-weight: 600; margin: 16pt 0 8pt; }
      h3 { font-size: 13pt; font-weight: 600; margin: 12pt 0 6pt; }
      p { margin: 0 0 8pt; }
      ul, ol { margin: 0 0 8pt 18pt; padding-left: 0; }
      li { margin-bottom: 2pt; }
      code { font-family: Menlo, Monaco, Consolas, monospace; background: #f3f4f6; padding: 1pt 3pt; border-radius: 2pt; font-size: 0.9em; }
      pre { background: #f3f4f6; padding: 8pt; border-radius: 4pt; white-space: pre-wrap; margin: 8pt 0; }
      pre code { background: transparent; padding: 0; }
      table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
      th, td { border: 1pt solid #d1d5db; padding: 4pt 6pt; text-align: left; vertical-align: top; }
      th { background: #f9fafb; font-weight: 600; }
      blockquote { border-left: 3pt solid #d1d5db; padding-left: 10pt; margin: 8pt 0; color: #4b5563; }
      a { color: #2563eb; text-decoration: underline; }
      hr { border: none; border-top: 1pt solid #e5e7eb; margin: 10pt 0; }
    </style>
    <h1>${escapeHtml(title)}</h1>
    <p style="color:#6b7280;font-size:9pt;margin-bottom:16pt;">${escapeHtml(path)}</p>
    ${html}
  `

  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.width = '210mm'
  container.style.padding = '15mm'
  container.style.background = '#ffffff'
  document.body.appendChild(container)

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const imgData = canvas.toDataURL('image/png')
    const pageWidth = 210
    const pageHeight = 297
    const imgWidth = pageWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pageHeight

    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
    }

    pdf.save(`${base}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}
