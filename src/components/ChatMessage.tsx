import { useState, useCallback } from 'react'
import { Message, type ToolEntry } from '../agent/types'
import { summariseToolEntries } from '../agent/toolSummary'
import { MarkdownArtifactCard } from './chat/artifacts'

interface ChatMessageProps {
  message: Message
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

const SmileAvatarMark = () => (
  <span className="ui-chat-avatar-mark" aria-hidden="true">:D</span>
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
  return summariseToolEntries(entries)
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
    <div className="ui-chat-thinking">
      {/* Header row */}
      <button
        onClick={() => hasMore && setExpanded(v => !v)}
        className={`ui-chat-thinking-header ui-type-section-label flex items-center gap-1.5 mb-1.5 ${hasMore ? 'hover:text-neutral-600 cursor-pointer' : 'cursor-default'}`}
      >
        <span>
          {isStreaming ? 'Thinking' : `Thought${timeLabel ? ` ${timeLabel}` : ''}`}
        </span>
        {hasMore && <ChevronIcon open={expanded} />}
      </button>

      {/* Content */}
      {(isStreaming || content) && (
        <div className="relative max-w-[85%]">
          <div className="ui-text-meta leading-relaxed whitespace-pre-wrap break-words">
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
                className="ui-text-meta hover:text-gray-600 transition-colors"
              >
                Show more
              </button>
            </div>
          )}

          {/* "Show less" when expanded */}
          {expanded && hasMore && (
            <button
              onClick={() => setExpanded(false)}
              className="mt-1 ui-text-meta hover:text-gray-600 transition-colors"
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

function formatArgs(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return 'No arguments'
  const raw = JSON.stringify(args, null, 2)
  if (raw.length <= 400) return raw
  return raw.slice(0, 400) + '\n…'
}

function formatResult(result: string | undefined, isError: boolean | undefined): string {
  if (!result) return isError ? 'Error (no details)' : 'No result'
  if (result.length <= 1200) return result
  return result.slice(0, 1200) + '\n…'
}

function ToolSummaryBlock({ entries }: { entries: ToolEntry[] }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => setOpen(v => !v), [])
  const summary = summariseEntries(entries)

  return (
    <div className="ui-chat-tool-summary">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 ui-text-meta transition-colors"
      >
        <span>{summary}</span>
        {entries.length > 0 && <ChevronIcon open={open} />}
      </button>

      {open && (
        <div className="mt-1.5 pl-2 border-l border-gray-100 space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="ui-text-meta leading-relaxed">
              {entries.length > 1 && <div className="font-medium">{entry.label}</div>}
              <pre className="mt-0.5 text-xs bg-gray-50 p-1.5 rounded overflow-x-auto">
                <code>{formatArgs(entry.args)}</code>
              </pre>
              {entry.result !== undefined && (
                <pre
                  className={`mt-1 text-xs p-1.5 rounded overflow-x-auto ${
                    entry.isError ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'
                  }`}
                >
                  <code>{formatResult(entry.result, entry.isError)}</code>
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main message renderer ────────────────────────────────────────────────────

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (message.type === 'tool_result') {
    return null
  }

  // Thinking block
  if (message.type === 'thinking' || message.isPlan) {
    return <ThinkingBlock message={message} />
  }

  // Markdown report artifact
  if (message.type === 'artifact' && message.artifact) {
    return (
      <div className="ui-chat-artifact animate-slide-in">
        <MarkdownArtifactCard artifact={message.artifact} messageId={message.id} />
      </div>
    )
  }

  // Tool summary block
  if (message.type === 'tool_summary' && message.toolEntries) {
    return <ToolSummaryBlock entries={message.toolEntries} />
  }

  // Structured activity stream row. Hidden from the transcript to avoid
  // duplicating the batched tool_summary block; activity state still drives
  // the composer indicator via ChatActivityContext.
  if (message.type === 'activity') {
    return null
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
          <pre key={i} className="ui-chat-code-block bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto my-2">
            <code>{code || lines.join('\n')}</code>
          </pre>
        )
      }
      return (
        <div key={i} className="ui-prose-chat">
          {part.split('\n').map((line, j) => {
            line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            line = line.replace(/\*(.*?)\*/g, '<em>$1</em>')
            line = line.replace(/`(.*?)`/g, '<code class="ui-md-code">$1</code>')
            line = line.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-neutral-700 hover:underline" target="_blank">$1</a>')
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
    <div className={`ui-chat-message w-full ${isUser ? 'ui-chat-message--user' : ''}`}>
      <div className={`ui-chat-avatar ${isUser ? 'ui-chat-avatar--user' : 'ui-chat-avatar--assistant'}`}>
        {isUser ? <UserIcon /> : <SmileAvatarMark />}
      </div>
      <div className={`ui-chat-message__body ${isUser ? '' : 'max-w-[80%]'}`}>
        <div className={`px-4 py-3 ${isUser ? 'ui-chat-bubble-user' : 'ui-chat-bubble-assistant'}`}>
          {renderContent(message.content)}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-0.5 bg-gray-400 rounded-sm animate-pulse align-text-bottom" />
          )}
        </div>
        {!message.isStreaming && (
          <p className={`ui-chat-meta ${isUser ? 'text-right' : ''}`}>
            {formatTime(message.timestamp)}
          </p>
        )}
      </div>
    </div>
  )
}
