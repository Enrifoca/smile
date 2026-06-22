export function buildDefaultContextMarkdown(_name: string): string {
  return ''
}

/**
 * Replace the body of a markdown section identified by heading text.
 * Matches ## Heading or # Heading (case-insensitive on the heading label).
 */
export function replaceMarkdownSection(markdown: string, heading: string, content: string): string {
  const normalizedHeading = heading.trim().replace(/^#+\s*/, '')
  if (!normalizedHeading) {
    throw new Error('heading is required')
  }

  const lines = markdown.split('\n')
  const headingPattern = new RegExp(`^(#{1,6})\\s+${escapeRegExp(normalizedHeading)}\\s*$`, 'i')
  let startIndex = -1
  let headingLevel = 0

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(headingPattern)
    if (match) {
      startIndex = i
      headingLevel = match[1].length
      break
    }
  }

  const sectionBody = content.trim()
  const sectionLines = sectionBody ? sectionBody.split('\n') : []

  if (startIndex === -1) {
    const prefix = markdown.endsWith('\n') || markdown.length === 0 ? markdown : `${markdown}\n`
    return `${prefix}\n## ${normalizedHeading}\n${sectionBody}\n`
  }

  let endIndex = lines.length
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{1,6})\s+/)
    if (match && match[1].length <= headingLevel) {
      endIndex = i
      break
    }
  }

  const before = lines.slice(0, startIndex + 1)
  const after = lines.slice(endIndex)
  return [...before, ...sectionLines, ...after].join('\n')
}

/**
 * Append content under a section heading, creating the section when missing.
 */
export function appendMarkdownSection(markdown: string, section: string, content: string): string {
  const normalizedSection = section.trim().replace(/^#+\s*/, '')
  if (!normalizedSection) {
    throw new Error('section is required')
  }

  const block = content.trim()
  const headingPattern = new RegExp(`^(#{1,6})\\s+${escapeRegExp(normalizedSection)}\\s*$`, 'im')
  const match = markdown.match(headingPattern)

  if (!match) {
    const prefix = markdown.endsWith('\n') || markdown.length === 0 ? markdown : `${markdown}\n`
    return `${prefix}\n## ${normalizedSection}\n\n${block}\n`
  }

  const headingLevel = match[1].length
  const lines = markdown.split('\n')
  let startIndex = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (headingPattern.test(lines[i])) {
      startIndex = i
      break
    }
  }
  if (startIndex === -1) {
    return `${markdown}\n\n## ${normalizedSection}\n\n${block}\n`
  }

  let endIndex = lines.length
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const levelMatch = lines[i].match(/^(#{1,6})\s+/)
    if (levelMatch && levelMatch[1].length <= headingLevel) {
      endIndex = i
      break
    }
  }

  const before = lines.slice(0, endIndex)
  const after = lines.slice(endIndex)
  const insertion = before.length > 0 && before[before.length - 1].trim() !== '' ? ['', block] : [block]
  return [...before, ...insertion, ...after].join('\n')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
