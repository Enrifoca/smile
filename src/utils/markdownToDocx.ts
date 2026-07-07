import { marked, type Token, type Tokens } from 'marked'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableCell,
  TableRow,
  AlignmentType,
  BorderStyle,
  NumberFormat,
  convertInchesToTwip,
} from 'docx'

function getText(token: Token): string {
  if ('tokens' in token && Array.isArray((token as Tokens.Text).tokens)) {
    return (token as Tokens.Text).tokens!.map(getText).join('')
  }
  if ('text' in token) return (token as Tokens.Text).text
  return ''
}

function processInline(tokens: Token[] | undefined): TextRun[] {
  if (!tokens) return []
  const runs: TextRun[] = []

  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text
        if (t.tokens) {
          runs.push(...processInline(t.tokens))
        } else {
          runs.push(new TextRun(t.text))
        }
        break
      }
      case 'strong':
        runs.push(new TextRun({ text: getText(token), bold: true }))
        break
      case 'em':
        runs.push(new TextRun({ text: getText(token), italics: true }))
        break
      case 'codespan':
        runs.push(
          new TextRun({
            text: (token as Tokens.Codespan).text,
            font: 'Courier New',
            shading: { fill: 'F3F4F6' },
          }),
        )
        break
      case 'link':
        runs.push(
          new TextRun({
            text: getText(token),
            style: 'Hyperlink',
            color: '2563EB',
            underline: { type: 'single' },
          }),
        )
        break
      case 'del':
      case 'strike':
        runs.push(new TextRun({ text: getText(token), strike: true }))
        break
      case 'br':
        runs.push(new TextRun('\n'))
        break
      default:
        if ('tokens' in token && Array.isArray((token as Tokens.Text).tokens)) {
          runs.push(...processInline((token as Tokens.Text).tokens))
        } else if ('text' in token) {
          runs.push(new TextRun((token as Tokens.Text).text))
        }
    }
  }

  return runs
}

function headingLevel(depth: number) {
  switch (depth) {
    case 1:
      return HeadingLevel.HEADING_1
    case 2:
      return HeadingLevel.HEADING_2
    case 3:
      return HeadingLevel.HEADING_3
    case 4:
      return HeadingLevel.HEADING_4
    case 5:
      return HeadingLevel.HEADING_5
    default:
      return HeadingLevel.HEADING_6
  }
}

function cellParagraphs(tokens: Token[]): Paragraph[] {
  return [new Paragraph({ children: processInline(tokens) })]
}

function processList(list: Tokens.List, level = 0): Paragraph[] {
  const paragraphs: Paragraph[] = []
  const ordered = list.ordered
  let index = Number(list.start ?? 1)

  for (const item of list.items) {
    const itemRuns: TextRun[] = []
    for (const token of item.tokens) {
      if (token.type === 'list') {
        paragraphs.push(...processList(token as Tokens.List, level + 1))
      } else if (token.type === 'paragraph' || token.type === 'text') {
        itemRuns.push(...processInline((token as Tokens.Paragraph | Tokens.Text).tokens))
      }
    }

    if (ordered) {
      paragraphs.push(
        new Paragraph({
          children: itemRuns,
          numbering: { reference: 'numbered', level },
        }),
      )
    } else {
      paragraphs.push(
        new Paragraph({
          children: itemRuns,
          bullet: { level },
        }),
      )
    }
    index += 1
  }

  return paragraphs
}

export async function markdownToDocxBlob(content: string, title: string): Promise<Blob> {
  const tokens = marked.lexer(content || '(empty report)', { gfm: true })
  const children: (Paragraph | Table)[] = []

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const t = token as Tokens.Heading
        children.push(
          new Paragraph({
            children: processInline(t.tokens),
            heading: headingLevel(t.depth),
          }),
        )
        break
      }
      case 'paragraph': {
        const t = token as Tokens.Paragraph
        children.push(new Paragraph({ children: processInline(t.tokens) }))
        break
      }
      case 'code': {
        const t = token as Tokens.Code
        const lines = t.text.split('\n')
        const runs = lines.map(
          (line, i) =>
            new TextRun({
              text: line,
              font: 'Courier New',
              break: i > 0 ? 1 : 0,
            }),
        )
        children.push(
          new Paragraph({
            children: runs,
            shading: { fill: 'F3F4F6' },
            spacing: { before: 120, after: 120 },
          }),
        )
        break
      }
      case 'blockquote': {
        const t = token as Tokens.Blockquote
        children.push(
          new Paragraph({
            children: [new TextRun({ text: t.tokens.map(getText).join(''), italics: true })],
            indent: { left: convertInchesToTwip(0.3) },
            spacing: { before: 80, after: 80 },
          }),
        )
        break
      }
      case 'list': {
        children.push(...processList(token as Tokens.List))
        break
      }
      case 'table': {
        const t = token as Tokens.Table
        const headerRow = new TableRow({
          children: t.header.map(cell =>
            new TableCell({
              children: cellParagraphs(cell.tokens),
              shading: { fill: 'F9FAFB' },
            }),
          ),
        })
        const bodyRows = t.rows.map(
          row =>
            new TableRow({
              children: row.map(cell => new TableCell({ children: cellParagraphs(cell.tokens) })),
            }),
        )
        children.push(new Table({ rows: [headerRow, ...bodyRows] }))
        break
      }
      case 'hr':
        children.push(
          new Paragraph({
            children: [new TextRun('')],
            border: {
              bottom: { color: 'D1D5DB', space: 1, style: BorderStyle.SINGLE, size: 6 },
            },
            spacing: { before: 120, after: 120 },
          }),
        )
        break
      case 'space':
      default:
        break
    }
  }

  const numbering = {
    config: [
      {
        reference: 'numbered',
        levels: [
          {
            level: 0,
            format: NumberFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) },
              },
            },
          },
        ],
      },
    ],
  }

  const doc = new Document({
    title,
    sections: [
      {
        properties: {
          page: { margin: { top: convertInchesToTwip(0.75), bottom: convertInchesToTwip(0.75), left: convertInchesToTwip(0.75), right: convertInchesToTwip(0.75) } },
        },
        children,
      },
    ],
    numbering,
  })

  return Packer.toBlob(doc)
}
