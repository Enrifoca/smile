import { useState, useCallback } from 'react'
import { Message, ToolEntry } from '../agent/types'
import ActionConfirm from './ActionConfirm'

interface ChatMessageProps {
  message: Message
  onApproveAction?: () => void
  onRejectAction?: () => void
  activePendingActionId?: string | null
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const BotIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
)

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatThinkingTime(ms: number): string {
  if (ms === 0) return ''
  const s = Math.round(ms / 1000)
  return s < 1 ? 'for <1s' : `for ${s}s`
}

/** Compute the collapsed summary label from a list of tool entries */
function summariseEntries(entries: ToolEntry[]): string {
  const count = (fn: (e: ToolEntry) => boolean) => entries.filter(fn).length
  const fileReads   = count(e => ['file_read', 'file_list'].includes(e.tool))
  const fileSearch  = count(e => e.tool === 'file_search')
  const jiraSearch  = count(e => e.tool === 'jira_search_issues')
  const jiraRead    = count(e => e.tool === 'jira_get_issue')
  const jiraWrite   = count(e => ['jira_create_issue','jira_update_issue','jira_add_comment','jira_transition_issue','jira_upload_attachment'].includes(e.tool))
  const fileWrite   = count(e => ['file_write','file_mkdir'].includes(e.tool))
  const memRead     = count(e => e.tool === 'memory_read')
  const memWrite    = count(e => e.tool === 'memory_update')
  const memDelete   = count(e => e.tool === 'memory_delete')

  const parts: string[] = []
  if (fileReads > 0 || fileSearch > 0) {
    const pieces: string[] = []
    if (fileReads > 0)  pieces.push(`${fileReads} file${fileReads > 1 ? 's' : ''}`)
    if (fileSearch > 0) pieces.push(`${fileSearch} search${fileSearch > 1 ? 'es' : ''}`)
    parts.push(`Explored ${pieces.join(', ')}`)
  }
  if (jiraSearch > 0 || jiraRead > 0) {
    const pieces: string[] = []
    if (jiraSearch > 0) pieces.push(`${jiraSearch} search${jiraSearch > 1 ? 'es' : ''}`)
    if (jiraRead > 0)   pieces.push(`${jiraRead} issue${jiraRead > 1 ? 's' : ''} read`)
    parts.push(`Searched Jira · ${pieces.join(', ')}`)
  }
  if (jiraWrite > 0) parts.push(`${jiraWrite} Jira update${jiraWrite > 1 ? 's' : ''}`)
  if (fileWrite > 0) parts.push(`${fileWrite} file${fileWrite > 1 ? 's' : ''} written`)
  if (memRead > 0)   parts.push('Checked memory')
  if (memWrite > 0)  parts.push('Memory updated')
  if (memDelete > 0) parts.push('Memory cleaned')
  return parts.join(' · ') || `${entries.length} action${entries.length !== 1 ? 's' : ''}`
}

// ─── ThinkingBlock ────────────────────────────────────────────────────────────

const PREVIEW_LINES = 4

function ThinkingBlock({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false)
  const timeLabel = formatThinkingTime(message.thinkingMs ?? 0)

  const content = message.content || ''
  const lines = content.split('\n')

  // During streaming: show all text as it arrives.
  // After done: show preview + fade unless expanded.
  const isStreaming = !!message.isStreaming
  const hasMore = !isStreaming && lines.length > PREVIEW_LINES
  const visibleContent = hasMore && !expanded
    ? lines.slice(0, PREVIEW_LINES).join('\n')
    : content

  return (
    <div className="pl-11 mb-2 animate-slide-in">
      {/* Header row */}
      <button
        onClick={() => hasMore && setExpanded(v => !v)}
        className={`flex items-center gap-1.5 text-[11px] text-gray-400 mb-1.5 ${hasMore ? 'hover:text-gray-500 cursor-pointer' : 'cursor-default'}`}
      >
        <span className="font-medium tracking-wide uppercase">
          {isStreaming ? 'Thinking' : `Thought${timeLabel ? ` ${timeLabel}` : ''}`}
        </span>
        {hasMore && <ChevronIcon open={expanded} />}
      </button>

      {/* Content */}
      {(isStreaming || content) && (
        <div className="relative max-w-[85%]">
          <div className="text-[12px] text-gray-400 leading-relaxed whitespace-pre-wrap break-words">
            {visibleContent}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3 ml-0.5 bg-gray-300 rounded-sm animate-pulse align-text-bottom" />
            )}
          </div>

          {/* Bottom fade + "Show more" when collapsed */}
          {hasMore && !expanded && (
            <div
              className="absolute bottom-0 left-0 right-0 h-8 flex items-end"
              style={{ background: 'linear-gradient(to top, #ffffff 40%, transparent)' }}
            >
              <button
                onClick={() => setExpanded(true)}
                className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                Show more
              </button>
            </div>
          )}

          {/* "Show less" when expanded */}
          {expanded && hasMore && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── ToolSummaryBlock ─────────────────────────────────────────────────────────

function ToolSummaryBlock({ entries }: { entries: ToolEntry[] }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen(v => !v), [])
  const summary = summariseEntries(entries)

  return (
    <div className="pl-11 mb-2 animate-slide-in">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-500 transition-colors"
      >
        <span>{summary}</span>
        {entries.length > 0 && <ChevronIcon open={open} />}
      </button>

      {open && (
        <div className="mt-1.5 pl-2 border-l border-gray-100 space-y-0.5">
          {entries.map((entry, i) => (
            <div key={i} className="text-[11px] text-gray-400 leading-relaxed">
              {entry.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main message renderer ────────────────────────────────────────────────────

export default function ChatMessage({ message, onApproveAction, onRejectAction, activePendingActionId }: ChatMessageProps) {
  const isUser = message.role === 'user'

  // Thinking block
  if (message.type === 'thinking' || message.isPlan) {
    return <ThinkingBlock message={message} />
  }

  // Tool summary block
  if (message.type === 'tool_summary' && message.toolEntries) {
    return <ToolSummaryBlock entries={message.toolEntries} />
  }

  if (message.pendingAction) {
    const isActive = message.pendingAction.id === activePendingActionId
    return (
      <div className="pl-11 animate-slide-in">
        <ActionConfirm
          action={message.pendingAction}
          status={message.pendingActionStatus || (isActive ? 'active' : 'cancelled')}
          onApprove={isActive ? (onApproveAction || (() => undefined)) : (() => undefined)}
          onReject={isActive ? (onRejectAction || (() => undefined)) : (() => undefined)}
        />
      </div>
    )
  }

  // Render rich content
  const renderContent = (content: string) => {
    // Strip any stray [Tool: ...] / [tool_result: ...] prefixes that should
    // never appear in visible assistant messages.
    content = content
      .replace(/^\[tool_result:[^\]]*\]\s*/i, '')
      .replace(/^\[Tool:[^\]]*\]\s*/i, '')
      .trim()

    const parts = content.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```')) {
        const lines = part.slice(3, -3).split('\n')
        const code = lines.slice(1).join('\n') || lines.join('\n')
        return (
          <pre key={i} className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto my-2 text-sm">
            <code>{code || lines.join('\n')}</code>
          </pre>
        )
      }
      return (
        <div key={i} className="prose-chat">
          {part.split('\n').map((line, j) => {
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            line = line.replace(/\*(.*?)\*/g, '<em>$1</em>')
            line = line.replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
            line = line.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-mirai-600 hover:underline" target="_blank">$1</a>')
            if (line.startsWith('- ') || line.startsWith('• ')) {
              return (
                <div key={j} className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  <span dangerouslySetInnerHTML={{ __html: line.slice(2) }} />
                </div>
              )
            }
            const numberedMatch = line.match(/^(\d+)\.\s(.*)/)
            if (numberedMatch) {
              return (
                <div key={j} className="flex items-start gap-2">
                  <span className="text-gray-400 min-w-[1.5rem]">{numberedMatch[1]}.</span>
                  <span dangerouslySetInnerHTML={{ __html: numberedMatch[2] }} />
                </div>
              )
            }
            if (!line.trim()) return <div key={j} className="h-2" />
            return <p key={j} className="mb-1" dangerouslySetInnerHTML={{ __html: line }} />
          })}
        </div>
      )
    })
  }

  const formatTime = (timestamp: string) =>
    new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex gap-3 animate-slide-in ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-mirai-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
        {isUser ? <UserIcon /> : <BotIcon />}
      </div>
      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`px-4 py-3 ${isUser ? 'message-user' : 'message-assistant'}`}>
          {renderContent(message.content)}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-0.5 bg-gray-400 rounded-sm animate-pulse align-text-bottom" />
          )}
        </div>
        {!message.isStreaming && (
          <p className={`text-xs text-gray-400 mt-1 ${isUser ? 'text-right' : ''}`}>
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  )
}
