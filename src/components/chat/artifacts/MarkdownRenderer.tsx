import { useMemo, type ReactElement } from 'react'
import { joinClasses } from '../../ui/classNames'

export interface MarkdownRendererProps {
  content: string
  className?: string
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="ui-md-code">$1</code>')
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="ui-md-link" target="_blank" rel="noreferrer">$1</a>')
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|')
}

function isTableDivider(line: string): boolean {
  return /^\|\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  const blocks = useMemo(() => {
    const lines = content.replace(/\r\n/g, '\n').split('\n')
    const elements: ReactElement[] = []
    let index = 0

    while (index < lines.length) {
      const line = lines[index]

      if (isTableRow(line) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
        const headerCells = line.trim().slice(1, -1).split('|').map(cell => cell.trim())
        index += 2
        const bodyRows: string[][] = []
        while (index < lines.length && isTableRow(lines[index])) {
          bodyRows.push(lines[index].trim().slice(1, -1).split('|').map(cell => cell.trim()))
          index += 1
        }
        elements.push(
          <div key={`table-${index}`} className="ui-md-table-wrap">
            <table className="ui-md-table">
              <thead>
                <tr>
                  {headerCells.map(cell => (
                    <th key={cell} dangerouslySetInnerHTML={{ __html: renderInline(cell) }} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} dangerouslySetInnerHTML={{ __html: renderInline(cell) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        continue
      }

      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={`h3-${index}`} className="ui-md-h3" dangerouslySetInnerHTML={{ __html: renderInline(line.slice(4)) }} />,
        )
        index += 1
        continue
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={`h2-${index}`} className="ui-md-h2" dangerouslySetInnerHTML={{ __html: renderInline(line.slice(3)) }} />,
        )
        index += 1
        continue
      }
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={`h1-${index}`} className="ui-md-h1" dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} />,
        )
        index += 1
        continue
      }

      if (line.startsWith('- ') || line.startsWith('• ')) {
        const items: string[] = []
        while (index < lines.length && (lines[index].startsWith('- ') || lines[index].startsWith('• '))) {
          items.push(lines[index].slice(2))
          index += 1
        }
        elements.push(
          <ul key={`ul-${index}`} className="ui-md-list">
            {items.map((item, itemIndex) => (
              <li key={itemIndex} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
            ))}
          </ul>,
        )
        continue
      }

      const numberedMatch = line.match(/^(\d+)\.\s+(.*)/)
      if (numberedMatch) {
        const items: string[] = []
        while (index < lines.length) {
          const numbered = lines[index].match(/^(\d+)\.\s+(.*)/)
          if (!numbered) break
          items.push(numbered[2])
          index += 1
        }
        elements.push(
          <ol key={`ol-${index}`} className="ui-md-list ui-md-list--ordered">
            {items.map((item, itemIndex) => (
              <li key={itemIndex} dangerouslySetInnerHTML={{ __html: renderInline(item) }} />
            ))}
          </ol>,
        )
        continue
      }

      if (!line.trim()) {
        index += 1
        continue
      }

      elements.push(
        <p key={`p-${index}`} className="ui-md-p" dangerouslySetInnerHTML={{ __html: renderInline(line) }} />,
      )
      index += 1
    }

    return elements
  }, [content])

  return <div className={joinClasses('ui-md', className)}>{blocks}</div>
}
