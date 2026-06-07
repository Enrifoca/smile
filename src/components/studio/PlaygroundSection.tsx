import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useElectron } from '../../hooks/useElectron'
import { ConnectorManifest, ToolManifest } from '../../connectors/contract'
import type { ProjectContext } from '../../context/types'
import type { PlaygroundLogEntry } from '../../types/playground'
import { Alert, Button, Callout, Field, Select, Spinner, Textarea } from '../ui'

function renderTemplate(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = args[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

function formatLogArgs(args: unknown[]): string {
  return args
    .map(arg => {
      if (typeof arg === 'string') return arg
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(' ')
}

function defaultArgsForTool(tool: ToolManifest | undefined): string {
  if (!tool) return '{\n  \n}'
  if (tool.name === 'example_get_post') return '{\n  "id": 1\n}'
  if (tool.name === 'example_echo') return '{\n  "message": "hello from playground"\n}'
  if (tool.name === 'jira_search_issues') return '{\n  "jql": "order by created DESC",\n  "maxResults": 5\n}'
  return '{\n  \n}'
}

/** Tools that only run through approveAction, not executeTool. */
function prefersApprovePath(toolName: string): boolean {
  return toolName === 'jira_batch_create_issues'
}

export default function PlaygroundSection() {
  const { connectors, contexts: contextsAPI } = useElectron()
  const logEndRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [pluginList, setPluginList] = useState<Array<{ manifest: ConnectorManifest; promptMarkdown: string }>>([])
  const [discoveryErrors, setDiscoveryErrors] = useState<Array<{ id: string; errors: string[] }>>([])
  const [contexts, setContexts] = useState<ProjectContext[]>([])

  const [connectorId, setConnectorId] = useState('')
  const [toolName, setToolName] = useState('')
  const [contextId, setContextId] = useState('')
  const [argsJson, setArgsJson] = useState('{\n  \n}')
  const [logs, setLogs] = useState<PlaygroundLogEntry[]>([])
  const [resultJson, setResultJson] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedManifest = useMemo(
    () => pluginList.find(item => item.manifest.id === connectorId)?.manifest,
    [pluginList, connectorId],
  )

  const selectedTool = useMemo(
    () => selectedManifest?.tools.find(tool => tool.name === toolName),
    [selectedManifest, toolName],
  )

  const selectedContext = useMemo(
    () => contexts.find(ctx => ctx.id === contextId) ?? null,
    [contexts, contextId],
  )

  const contextEnvelope = useMemo(() => {
    if (!selectedContext || !connectorId) return undefined
    const config = selectedContext.connectorScopes[connectorId] ?? null
    return { contextId: selectedContext.id, config }
  }, [selectedContext, connectorId])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [connResult, ctxResult] = await Promise.all([connectors.list(), contextsAPI.list()])
      if (connResult.success && connResult.data) {
        setPluginList(connResult.data.connectors)
        setDiscoveryErrors(connResult.data.errors)
        if (connResult.data.connectors.length > 0) {
          setConnectorId(current => {
            if (current) return current
            const first = connResult.data!.connectors[0].manifest
            const firstTool = first.tools[0]
            setToolName(firstTool?.name ?? '')
            setArgsJson(defaultArgsForTool(firstTool))
            return first.id
          })
        }
      } else if (connResult.error) {
        setError(connResult.error)
      }
      if (ctxResult.success && ctxResult.data) setContexts(ctxResult.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playground data')
    } finally {
      setLoading(false)
    }
  }, [connectors, contextsAPI])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const unsubscribe = connectors.onPlaygroundLog(entry => {
      setLogs(prev => [...prev, entry])
    })
    return unsubscribe
  }, [connectors])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  function handleConnectorChange(nextId: string) {
    setConnectorId(nextId)
    const manifest = pluginList.find(item => item.manifest.id === nextId)?.manifest
    const firstTool = manifest?.tools[0]
    setToolName(firstTool?.name ?? '')
    setArgsJson(defaultArgsForTool(firstTool))
    setResultJson(null)
    setError(null)
  }

  function handleToolChange(nextTool: string) {
    setToolName(nextTool)
    const tool = selectedManifest?.tools.find(item => item.name === nextTool)
    setArgsJson(defaultArgsForTool(tool))
    setResultJson(null)
  }

  async function handleRun(mode: 'execute' | 'approve') {
    if (!connectorId || !toolName || running) return

    let args: Record<string, unknown>
    try {
      args = JSON.parse(argsJson) as Record<string, unknown>
    } catch {
      setError('Arguments must be valid JSON.')
      return
    }

    setRunning(true)
    setError(null)
    setResultJson(null)
    setLogs(prev => [
      ...prev,
      {
        connectorId,
        level: 'info',
        args: [`▶ ${mode === 'approve' ? 'approveAction' : 'executeTool'}(${toolName})`],
        timestamp: new Date().toISOString(),
      },
    ])

    try {
      const outcome =
        mode === 'approve'
          ? await connectors.approve(connectorId, toolName, args, contextEnvelope)
          : await connectors.execute(connectorId, toolName, args, contextEnvelope)
      setResultJson(JSON.stringify(outcome, null, 2))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setResultJson(JSON.stringify({ success: false, error: message }, null, 2))
    } finally {
      setRunning(false)
    }
  }

  const parsedArgs = useMemo(() => {
    try {
      return JSON.parse(argsJson) as Record<string, unknown>
    } catch {
      return null
    }
  }, [argsJson])

  const confirmationPreview =
    selectedTool?.confirmation?.summary && parsedArgs
      ? renderTemplate(selectedTool.confirmation.summary, parsedArgs)
      : null

  const useApproveByDefault = selectedTool ? prefersApprovePath(selectedTool.name) : false

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-medium text-neutral-950">Playground</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Run a connector tool with JSON arguments. Logs from the sandbox appear below; no agent loop involved.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Spinner size="sm" />
          <span>Loading connectors…</span>
        </div>
      )}

      {!loading && pluginList.length === 0 && (
        <Callout>
          No plugins in <code>.smile/connectors</code>. Copy a connector from <code>examples/connectors</code> into
          your workspace, then refresh.
        </Callout>
      )}

      {discoveryErrors.length > 0 && (
        <div className="space-y-2">
          {discoveryErrors.map(item => (
            <Alert key={item.id}>
              {item.id}: {item.errors.join('; ')}
            </Alert>
          ))}
        </div>
      )}

      {pluginList.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-lg border border-neutral-200 p-4">
            <Field label="Connector">
              <Select value={connectorId} onChange={event => handleConnectorChange(event.target.value)}>
                {pluginList.map(({ manifest }) => (
                  <option key={manifest.id} value={manifest.id}>
                    {manifest.name} ({manifest.id})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Tool">
              <Select value={toolName} onChange={event => handleToolChange(event.target.value)}>
                {(selectedManifest?.tools ?? []).map(tool => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                    {tool.requiresConfirmation ? ' · confirm' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedTool && (
              <p className="text-xs text-neutral-500">{selectedTool.description}</p>
            )}

            <Field label="Context (optional)" hint="Injects host.context.get() config for this connector">
              <Select value={contextId} onChange={event => setContextId(event.target.value)}>
                <option value="">None</option>
                {contexts.map(ctx => (
                  <option key={ctx.id} value={ctx.id}>
                    {ctx.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Arguments (JSON)">
              <Textarea
                value={argsJson}
                onChange={event => setArgsJson(event.target.value)}
                rows={10}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </Field>

            {selectedTool?.requiresConfirmation && confirmationPreview && (
              <Callout>
                Confirmation preview: {confirmationPreview}
              </Callout>
            )}

            {useApproveByDefault && (
              <Callout>
                This tool runs through <code>approveAction</code> (orchestrated writes), not a direct execute.
              </Callout>
            )}

            <div className="flex flex-wrap gap-2">
              {!useApproveByDefault && (
                <Button onClick={() => void handleRun('execute')} loading={running}>
                  Run tool
                </Button>
              )}
              {(useApproveByDefault || selectedTool?.requiresConfirmation) && (
                <Button
                  variant={useApproveByDefault ? 'primary' : 'secondary'}
                  onClick={() => void handleRun('approve')}
                  loading={running}
                >
                  {useApproveByDefault ? 'Run via approveAction' : 'Test approveAction'}
                </Button>
              )}
              {!useApproveByDefault && selectedTool?.requiresConfirmation && (
                <Button variant="secondary" onClick={() => void handleRun('execute')} loading={running}>
                  Run without approve
                </Button>
              )}
              <Button variant="secondary" onClick={() => setLogs([])} disabled={running}>
                Clear logs
              </Button>
              <Button variant="secondary" onClick={() => void loadData()} disabled={running}>
                Refresh
              </Button>
            </div>

            {error && <Alert>{error}</Alert>}
          </div>

          <div className="space-y-4">
            <Field label="Result">
              <pre className="max-h-64 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800">
                {resultJson ?? 'Run a tool to see the result.'}
              </pre>
            </Field>

            <Field label="Sandbox logs" hint="host.log and playground markers">
              <div className="max-h-80 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-950 p-3 font-mono text-xs text-neutral-100">
                {logs.length === 0 && <span className="text-neutral-500">No logs yet.</span>}
                {logs.map((entry, index) => {
                  const time = entry.timestamp.slice(11, 19)
                  const filtered = connectorId && entry.connectorId !== connectorId
                  return (
                    <div
                      key={`${entry.timestamp}-${index}`}
                      className={filtered ? 'opacity-40' : undefined}
                    >
                      <span className="text-neutral-500">[{time}]</span>{' '}
                      <span className="text-neutral-400">{entry.connectorId}</span>{' '}
                      <span className={
                        entry.level === 'error' ? 'text-red-400'
                          : entry.level === 'warn' ? 'text-amber-300'
                            : 'text-neutral-200'
                      }>
                        {entry.level}:
                      </span>{' '}
                      {formatLogArgs(entry.args)}
                    </div>
                  )
                })}
                <div ref={logEndRef} />
              </div>
            </Field>
          </div>
        </div>
      )}
    </section>
  )
}
