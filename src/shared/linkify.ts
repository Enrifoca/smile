/**
 * Convert bare http(s) URLs in an HTML string into anchor tags.
 * Existing `<a>...</a>` tags are preserved so markdown links are not corrupted.
 */
export function linkifyUrls(html: string, anchorClassName: string): string {
  const anchors: string[] = []
  const protectedText = html.replace(/<a\b[^>]*>.*?<\/a>/gi, (match) => {
    const index = anchors.length
    anchors.push(match)
    return `__ANCHOR_${index}__`
  })

  const linkified = protectedText.replace(
    /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g,
    (match) => {
      // Trim trailing punctuation that is unlikely to be part of the URL.
      const url = match.replace(/[.,;:!?')>\]$]+$/, '')
      return `<a href="${url}" class="${anchorClassName}" target="_blank" rel="noreferrer">${url}</a>`
    },
  )

  return linkified.replace(/__ANCHOR_(\d+)__/g, (_, index) => anchors[index])
}
