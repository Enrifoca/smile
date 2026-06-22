import fs from 'fs'

const transcriptPath =
  'C:/Users/Enrico/.cursor/projects/c-Users-Enrico-Desktop-smile/agent-transcripts/90e315ae-35fc-4c1c-a8ec-0b94d2e5ac66/90e315ae-35fc-4c1c-a8ec-0b94d2e5ac66.jsonl'
const target = process.argv[2]
const transcript = fs.readFileSync(transcriptPath, 'utf8')
const files = new Map()

function normalizeRel(p) {
  const norm = p.replace(/\\/g, '/')
  const idx = norm.toLowerCase().indexOf('/smile/')
  if (idx === -1) return null
  return norm.slice(idx + '/smile/'.length)
}

for (const line of transcript.split('\n')) {
  if (!line.trim()) continue
  let row
  try {
    row = JSON.parse(line)
  } catch {
    continue
  }
  if (row.role === 'user') {
    const text = JSON.stringify(row.message ?? '')
    if (text.includes('namespace Atlassian') || text.includes('name space Atlassian')) break
  }
  const content = row.message?.content
  if (!Array.isArray(content)) continue
  for (const block of content) {
    if (block.type !== 'tool_use' || block.name !== 'Write') continue
    const rel = normalizeRel(block.input?.path ?? '')
    if (rel === target) files.set(rel, block.input.contents)
  }
}

console.log(files.get(target) ?? 'NOT FOUND')
