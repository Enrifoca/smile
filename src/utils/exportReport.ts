import { jsPDF } from 'jspdf'

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

export function exportReportAsDoc(content: string, title: string, path: string) {
  const base = sanitizeFilename(title || path.split('/').pop() || 'report')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body><pre style="font-family:Segoe UI, sans-serif; white-space:pre-wrap;">${content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></body></html>`
  downloadBlob(new Blob([html], { type: 'application/msword' }), `${base}.doc`)
}

export function exportReportAsPdf(content: string, title: string, path: string) {
  const base = sanitizeFilename(title || path.split('/').pop() || 'report')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(title, 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(path, 14, 22)
  doc.setTextColor(0)
  const lines = doc.splitTextToSize(content || '(empty report)', 182)
  doc.text(lines, 14, 30)
  doc.save(`${base}.pdf`)
}
