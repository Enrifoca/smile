import { useEffect, useRef, useState } from 'react'
import type { AgentContextSnapshot } from '../../agent'
import { estimateTokens } from '../../agent/historyCompression'
import { Button } from '../ui/Button'
import type { ProjectContext } from '../../context/types'
import { getContextFolderPath, getEnabledConnectorIds } from '../../context/types'

export interface ContextSummaryModalProps {
  activeContext: ProjectContext | null
  contextSnapshot: AgentContextSnapshot | null
  onClose: () => void
}

function ContextIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}

function Section({
  title,
  present,
  tokens,
  children,
  defaultOpen = false,
}: {
  title: string
  present: boolean
  tokens?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!present) return null
  return (
    <div className="border border-neutral-200 rounded">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-neutral-50 hover:bg-neutral-100"
      >
        <span className="font-medium text-neutral-900">{title}</span>
        <span className="text-xs text-neutral-500">
          {tokens !== undefined && tokens > 0 && <span className="mr-2 text-neutral-400">~{tokens.toLocaleString()} tokens</span>}
          {open ? 'Collapse' : 'Expand'}
        </span>
      </button>
      {open && <div className="px-3 py-3 text-sm text-neutral-800 border-t border-neutral-200">{children}</div>}
    </div>
  )
}

function renderContent(content: string | undefined): React.ReactNode {
  if (!content) return <p className="text-neutral-500 italic">Empty</p>
  return (
    <pre className="whitespace-pre-wrap break-words text-xs bg-neutral-50 p-2 rounded overflow-x-auto">
      <code>{content}</code>
    </pre>
  )
}

function renderJson(value: unknown): React.ReactNode {
  return (
    <pre className="text-xs bg-neutral-50 p-2 rounded overflow-x-auto">
      <code>{JSON.stringify(value, null, 2)}</code>
    </pre>
  )
}

export function ContextSummaryModal({ activeContext, contextSnapshot, onClose }: ContextSummaryModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const hasSnapshot = !!contextSnapshot
  const sections = contextSnapshot?.sections ?? []
  const presentSectionNames = new Set(sections.filter(s => s.present).map(s => s.name))
  const recentHistoryTokens = contextSnapshot?.recentHistory?.reduce((sum, m) => sum + estimateTokens(m.content), 0) ?? 0
  const latestToolResultsTokens = contextSnapshot?.latestToolResults?.reduce(
    (sum, r) => sum + estimateTokens(r.result) + estimateTokens(JSON.stringify(r.args)),
    0,
  ) ?? 0

  return (
    <div className="ui-artifact-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className="ui-artifact-modal"
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Agent context inspector"
      >
        <div className="ui-artifact-modal-header">
          <div className="flex items-center gap-2">
            <ContextIcon />
            <h2 className="ui-artifact-modal-title">Agent context inspector</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="ui-artifact-modal-body">
          {!hasSnapshot && !activeContext ? (
            <p className="text-neutral-600">No agent call has been made yet in this chat and no context is selected.</p>
          ) : (
            <div className="space-y-4 text-sm">
              {!hasSnapshot && (
                <p className="text-neutral-600">No agent call has been made yet in this chat.</p>
              )}

              {contextSnapshot?.metadata && (
                <div className="flex flex-wrap gap-2 text-xs text-neutral-500">
                  <span>Iteration {contextSnapshot.metadata.iteration}</span>
                  <span>•</span>
                  <span>{new Date(contextSnapshot.metadata.timestamp).toLocaleString()}</span>
                  {contextSnapshot.totalTokens !== undefined && (
                    <>
                      <span>•</span>
                      <span>~{contextSnapshot.totalTokens.toLocaleString()} total tokens</span>
                    </>
                  )}
                </div>
              )}

              <Section title="User prompt" present={Boolean(contextSnapshot?.userMessage)} tokens={contextSnapshot ? estimateTokens(contextSnapshot.userMessage) : 0} defaultOpen>
                {renderContent(contextSnapshot?.userMessage)}
              </Section>

              <Section title="System prompt" present={Boolean(contextSnapshot?.systemPrompt)} tokens={contextSnapshot?.systemPrompt ? estimateTokens(contextSnapshot.systemPrompt) : 0}>
                <p className="text-neutral-500 mb-2">
                  Full system prompt sent to the model on the latest call.
                </p>
                {renderContent(contextSnapshot?.systemPrompt)}
              </Section>

              <Section
                title="Active project context"
                present={presentSectionNames.has('Active context') || !!activeContext}
                tokens={sections.find(s => s.name === 'Active context')?.tokens}
                defaultOpen
              >
                {!activeContext ? (
                  <p className="text-neutral-600">No active context is selected.</p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-neutral-400">Name</p>
                      <p className="font-medium text-neutral-900">{activeContext.name}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-neutral-400">Folder</p>
                      <code className="text-xs bg-neutral-100 px-1.5 py-1 rounded">{getContextFolderPath(activeContext)}</code>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-neutral-400">Enabled connectors</p>
                      {getEnabledConnectorIds(activeContext).length === 0 ? (
                        <p className="text-neutral-600">None enabled.</p>
                      ) : (
                        <ul className="mt-1 space-y-2">
                          {getEnabledConnectorIds(activeContext).map(id => (
                            <li key={id} className="rounded border border-neutral-200 p-2">
                              <p className="font-medium capitalize">{id}</p>
                              <pre className="mt-1 text-xs bg-neutral-50 p-1.5 rounded overflow-x-auto">
                                <code>{JSON.stringify(activeContext.connectors[id]?.config ?? {}, null, 2)}</code>
                              </pre>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </Section>

              {sections
                .filter(s => s.name !== 'Active context' && s.name !== 'System prompt' && s.name !== 'Recent conversation history' && s.present)
                .map(s => (
                  <Section key={s.name} title={s.name} present tokens={s.tokens}>
                    {s.content === undefined ? (
                      <p className="text-neutral-500 italic">This section is referenced but its full content is hidden in the inspector.</p>
                    ) : (
                      renderContent(s.content)
                    )}
                  </Section>
                ))}

              <Section
                title="Recent conversation history"
                present={!!contextSnapshot?.recentHistory && contextSnapshot.recentHistory.length > 0}
                tokens={recentHistoryTokens}
              >
                <div className="space-y-2">
                  {contextSnapshot?.recentHistory?.map((m, i) => (
                    <div key={i} className="border-l-2 border-neutral-200 pl-2">
                      <p className="text-xs uppercase tracking-wide text-neutral-400 mb-0.5">{m.role}</p>
                      {renderContent(m.content)}
                    </div>
                  ))}
                </div>
              </Section>

              <Section
                title="Latest tool results"
                present={!!contextSnapshot?.latestToolResults && contextSnapshot.latestToolResults.length > 0}
                tokens={latestToolResultsTokens}
              >
                <div className="space-y-3">
                  {contextSnapshot?.latestToolResults?.map((r, i) => (
                    <div key={i} className="border border-neutral-200 rounded p-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{r.tool}</p>
                        {r.isError && <span className="text-xs text-red-600 font-medium">Error</span>}
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-neutral-500 mb-0.5">Arguments</p>
                        {renderJson(r.args)}
                      </div>
                      <div className="mt-2">
                        <p className="text-xs text-neutral-500 mb-0.5">Result</p>
                        {renderContent(r.result)}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
