import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const transcriptPath =
  'C:/Users/Enrico/.cursor/projects/c-Users-Enrico-Desktop-smile/agent-transcripts/90e315ae-35fc-4c1c-a8ec-0b94d2e5ac66/90e315ae-35fc-4c1c-a8ec-0b94d2e5ac66.jsonl'
const root = 'C:/Users/Enrico/Desktop/smile'
const files = new Map()
const skipped = []

function normalizeRel(p) {
  const norm = p.replace(/\\/g, '/')
  const idx = norm.toLowerCase().indexOf('/smile/')
  if (idx === -1) return null
  return norm.slice(idx + '/smile/'.length)
}

function normalizeText(text) {
  return text.replace(/\r\n/g, '\n')
}

function readGitBase(rel) {
  try {
    return execFileSync('git', ['show', `HEAD:${rel.replace(/\\/g, '/')}`], {
      cwd: root,
      encoding: 'utf8',
    })
  } catch {
    return null
  }
}

function readBase(rel) {
  if (files.has(rel)) return files.get(rel)
  const full = path.join(root, rel)
  if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8')
  return readGitBase(rel)
}

function applyReplace(rel, oldStr, newStr, replaceAll) {
  let cur = readBase(rel)
  if (cur == null) {
    skipped.push({ rel, reason: 'missing base', old: oldStr.slice(0, 80) })
    return
  }
  const curNorm = normalizeText(cur)
  const oldNorm = normalizeText(oldStr)
  const newNorm = normalizeText(newStr)
  let next
  if (replaceAll) {
    if (!curNorm.includes(oldNorm)) {
      skipped.push({ rel, reason: 'old_string not found (replace_all)', old: oldStr.slice(0, 80) })
      return
    }
    next = curNorm.split(oldNorm).join(newNorm)
  } else if (curNorm.includes(oldNorm)) {
    next = curNorm.replace(oldNorm, newNorm)
  } else {
    skipped.push({ rel, reason: 'old_string not found', old: oldStr.slice(0, 80) })
    return
  }
  files.set(rel, next)
}

const transcript = fs.readFileSync(transcriptPath, 'utf8')
let ops = 0

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
    if (text.includes('namespace Atlassian') || text.includes('name space Atlassian')) {
      break
    }
  }

  const content = row.message?.content
  if (!Array.isArray(content)) continue

  for (const block of content) {
    if (block.type !== 'tool_use') continue
    const { name, input } = block
    if (!input?.path) continue
    const rel = normalizeRel(input.path)
    if (!rel) continue
    ops++

    if (name === 'Write') {
      files.set(rel, normalizeText(input.contents))
      continue
    }

    if (name === 'Delete') {
      files.set(rel, null)
      continue
    }

    if (name === 'StrReplace') {
      applyReplace(rel, input.old_string ?? '', input.new_string ?? '', Boolean(input.replace_all))
    }
  }
}

let written = 0
let deleted = 0
for (const [rel, content] of files.entries()) {
  const full = path.join(root, rel)
  if (content === null) {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full)
      deleted++
    }
    continue
  }
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
  written++
}

const shellFiles = [...files.keys()]
  .filter(k => k.includes('shell') || k.startsWith('src/shell'))
  .sort()

console.log(
  JSON.stringify(
    {
      ops,
      written,
      deleted,
      total: files.size,
      skippedCount: skipped.length,
      skippedSample: skipped.slice(0, 20),
      shellFiles,
      hasApp: files.has('src/App.tsx'),
      hasTokens: files.has('src/theme/tokens.css'),
      hasMain: files.has('electron/main.ts'),
      hasChatHistory: files.has('src/components/shell/ChatHistorySidebar.tsx'),
    },
    null,
    2,
  ),
)
