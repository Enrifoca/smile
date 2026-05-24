export interface ChatEmptyStateProps {
  title?: string
  description?: string
  suggestions?: string[]
  onSuggestionClick?: (suggestion: string) => void
}

const DEFAULT_SUGGESTIONS = [
  'Show me open records',
  'Summarize this workspace',
  'Generate a status report',
  'List connected scopes',
]

export function ChatEmptyState({
  title = 'How can I help you today?',
  description = 'Ask me anything, work with your files, or use any configured connector.',
  suggestions = DEFAULT_SUGGESTIONS,
  onSuggestionClick,
}: ChatEmptyStateProps) {
  return (
    <div className="ui-chat-empty">
      <h2 className="ui-chat-empty-title">{title}</h2>
      <p className="ui-chat-empty-description">{description}</p>
      {suggestions.length > 0 ? (
        <div className="ui-chat-suggestions">
          {suggestions.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionClick?.(suggestion)}
              className="ui-chat-suggestion"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
