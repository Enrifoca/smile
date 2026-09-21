import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { useElectron } from '../../hooks/useElectron'

import { titleFromReportPath, isReportArtifactPath } from '../../agent/artifacts'

import type { InspectorTabId } from '../../shell/types'

import type { ProjectContext } from '../../context/types'

import { getContextFolderPath } from '../../context/types'

import { MarkdownArtifactModal } from '../chat/artifacts/MarkdownArtifactModal'

import { useArtifactContent } from '../chat/artifacts/useArtifactContent'

import { Toggle } from '../ui'

import PanelCollapseIcon from './PanelCollapseIcon'

interface ReportRow {
  path: string
  name: string
  /** True when the report is referenced as active but was not found in the workspace scan. */
  missing?: boolean
}

interface InspectorPanelProps {
  open: boolean
  onToggleOpen: () => void
  contexts: ProjectContext[]
  activeContextId: string | null
  onContextsChange: (contexts: ProjectContext[]) => void
  onSetActiveContextId: (contextId: string | null) => void
  onOpenContextDetail: (contextId: string, name: string) => void
  onSetActiveReport: (path: string | null, title: string) => void
  /** Effective active report (transcript or pinned). Used for highlighting and the tab dot. */
  activeReportPath: string | null
  /** User-pinned report. Used for the toggle switch state. */
  pinnedReportPath: string | null
}

const INSPECTOR_TABS: Array<{ id: InspectorTabId; label: string }> = [
  { id: 'context', label: 'Contexts' },
  { id: 'reports', label: 'Reports' },
]

const InfoIcon = () => (
  <svg className="ui-inspector__hint-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
    <path stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" d="M8 7v4" />
    <circle cx="8" cy="5.1" r="0.75" fill="currentColor" stroke="none" />
  </svg>
)

function InspectorHint({ children }: { children: ReactNode }) {
  return (
    <p className="ui-inspector__hint ui-type-hint">
      <span className="ui-inspector__hint-inner">
        <InfoIcon />
        <span>{children}</span>
      </span>
    </p>
  )
}

function InspectorItemHeading({ title, active }: { title: string; active: boolean }) {
  return (
    <span className="ui-inspector-item__heading">
      {active ? (
        <span className="ui-active-dot" title="Active" aria-label="Active" />
      ) : null}
      <span className={`ui-inspector-item__title ${active ? 'ui-inspector-item__title--active' : ''}`}>
        {title}
      </span>
    </span>
  )
}

function InspectorReportModal({ path, onClose }: { path: string; onClose: () => void }) {
  const title = titleFromReportPath(path)
  const { content, error, loading, reload } = useArtifactContent(path, path)

  useEffect(() => {
    reload()
  }, [path, reload])

  return (
    <MarkdownArtifactModal
      artifact={{ path, title }}
      content={content}
      loading={loading}
      error={error}
      onClose={onClose}
    />
  )
}

export default function InspectorPanel({
  open,
  onToggleOpen,
  contexts,
  activeContextId,
  onContextsChange,
  onSetActiveContextId,
  onOpenContextDetail,
  onSetActiveReport,
  activeReportPath,
  pinnedReportPath,
}: InspectorPanelProps) {
  const { file, contexts: contextsAPI } = useElectron()
  const [tab, setTab] = useState<InspectorTabId>('context')
  const [reports, setReports] = useState<ReportRow[]>([])
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [viewingReportPath, setViewingReportPath] = useState<string | null>(null)

  const isInternalPath = useCallback((reportPath: string): boolean => {
    const normalized = reportPath.replace(/\\/g, '/')
    // Context metadata in .smile/ is internal: knowledge markdown, backups,
    // generic files (now superseded by visible contexts/<slug>/files/), memories,
    // and connector configs.
    if (/\.smile\/contexts\/[^/]+\/(?!\d{4}-\d{2}-\d{2}_)[^/]+\.md$/.test(normalized)) return true
    if (/\.smile\/contexts\/[^/]+\/history\//.test(normalized)) return true
    if (/\.smile\/contexts\/[^/]+\/files\//.test(normalized)) return true
    if (/\.smile\/memories\//.test(normalized)) return true
    if (/\.smile\/connectors\//.test(normalized)) return true
    return false
  }, [])

  const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'release', 'out'])

  const findMarkdownFilesRecursive = useCallback(
    async (dir: string): Promise<ReportRow[]> => {
      try {
        const result = await file.list(dir)
        if (!result.success || !result.data) return []

        const rows: ReportRow[] = []
        const entries = result.data as Array<{ name: string; path: string; isDirectory: boolean }>
        for (const entry of entries) {
          if (entry.isDirectory) {
            if (SKIPPED_DIRS.has(entry.name)) continue
            if (entry.name.startsWith('.') && entry.name !== '.smile') continue
            const subRows = await findMarkdownFilesRecursive(entry.path)
            rows.push(...subRows)
          } else if (entry.name.toLowerCase().endsWith('.md')) {
            rows.push({ path: entry.path, name: entry.name })
          }
        }
        return rows
      } catch (error) {
        console.error('[InspectorPanel] Failed to list directory:', dir, error)
        return []
      }
    },
    [file],
  )

  const loadReports = useCallback(async () => {
    try {
      // Use both the fast filename search and a manual recursive scan so reports
      // are found even when the workspace is large or the search index is stale.
      const [searchResult, manualRows] = await Promise.all([
        file.search('*.md', ''),
        findMarkdownFilesRecursive(''),
      ])

      console.log('[InspectorPanel] file.search result:', searchResult)
      console.log('[InspectorPanel] manual scan rows:', manualRows)

      const searchRows = (searchResult.success && Array.isArray(searchResult.data)
        ? (searchResult.data as Array<{ path: string; name: string }>)
        : []) as ReportRow[]

      const seen = new Set<string>()
      const rawRows: ReportRow[] = []
      for (const row of [...searchRows, ...manualRows]) {
        if (seen.has(row.path)) continue
        seen.add(row.path)
        rawRows.push(row)
      }

      const rows = rawRows
        .filter(row => isReportArtifactPath(row.path) || !isInternalPath(row.path))
        .map(row => ({ path: row.path, name: row.name }))

      console.log('[InspectorPanel] filtered reports:', rows)

      // Sort by path (which starts with date for generated reports) descending.
      rows.sort((a, b) => b.path.localeCompare(a.path))
      setReports(rows)
      setReportsError(searchResult.success ? null : (searchResult.error ?? 'Failed to search for reports'))
    } catch (error) {
      console.error('Failed to load reports:', error)
      setReportsError(error instanceof Error ? error.message : 'Failed to load reports')
      setReports([])
    }
  }, [file, isInternalPath, findMarkdownFilesRecursive])

  const loadContexts = useCallback(async () => {
    try {
      const result = await contextsAPI.list()
      if (result.success && result.data) {
        onContextsChange(result.data)
      }
    } catch (error) {
      console.error('Failed to load contexts:', error)
    }
  }, [contextsAPI, onContextsChange])

  useEffect(() => {
    if (!open || tab !== 'reports') return
    void loadReports()
  }, [open, tab, loadReports])

  useEffect(() => {
    if (!open || tab !== 'reports') return
    void loadReports()
  }, [open, tab, activeReportPath, loadReports])

  useEffect(() => {
    if (!open || tab !== 'reports') return
    const refreshOnFocus = () => {
      void loadReports()
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [open, tab, loadReports])

  useEffect(() => {
    if (!open || tab !== 'reports') return
    const id = window.setInterval(() => {
      void loadReports()
    }, 3000)
    return () => window.clearInterval(id)
  }, [open, tab, loadReports])

  useEffect(() => {
    if (!open || tab !== 'context') return
    void loadContexts()
  }, [open, tab, loadContexts])

  useEffect(() => {
    if (!open || tab !== 'context') return
    const refreshOnFocus = () => {
      void loadContexts()
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [open, tab, loadContexts])

  useEffect(() => {
    if (!open || tab !== 'context') return
    const id = window.setInterval(() => {
      void loadContexts()
    }, 3000)
    return () => window.clearInterval(id)
  }, [open, tab, loadContexts])

  const resolvedActiveContextId =
    activeContextId && contexts.some(context => context.id === activeContextId)
      ? activeContextId
      : null

  if (!open) {
    return (
      <aside className="ui-inspector-rail">
        <button
          type="button"
          className="ui-panel-toggle ui-chrome-icon-btn"
          onClick={onToggleOpen}
          aria-label="Show inspector"
          title="Show inspector"
        >
          <PanelCollapseIcon expanded={false} side="right" />
        </button>
      </aside>
    )
  }

  return (
    <aside className="ui-inspector">
      <div className="ui-inspector__head">
        <h3 className="ui-inspector__title">Inspector</h3>
        <button
          type="button"
          className="ui-panel-toggle ui-chrome-icon-btn"
          onClick={onToggleOpen}
          aria-label="Hide inspector"
          title="Hide inspector"
        >
          <PanelCollapseIcon expanded={open} side="right" />
        </button>
      </div>
      <div className="ui-inspector__tabs">
        {INSPECTOR_TABS.map(item => {
          const tabHasActive =
            item.id === 'reports' ? Boolean(activeReportPath) : Boolean(resolvedActiveContextId)
          return (
            <button
              key={item.id}
              type="button"
              className={`ui-inspector__tab ${tab === item.id ? 'ui-inspector__tab--active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span className="ui-inspector__tab-label">
                {item.label}
                {tabHasActive ? (
                  <span className="ui-active-dot" title="Has active item" aria-label="Has active item" />
                ) : null}
              </span>
            </button>
          )
        })}
      </div>

      {tab === 'reports' && (
        <>
          <InspectorHint>
            Click a report to read it. Toggle to pin it in the current chat composer context.
          </InspectorHint>
          <div className="ui-inspector__scroll">
            {(() => {
              // Ensure the active report is always visible, even if the file was
              // deleted, moved, or saved in a folder the scan missed.
              const seen = new Set(reports.map(r => r.path))
              const merged = activeReportPath && !seen.has(activeReportPath)
                ? [...reports, { path: activeReportPath, name: activeReportPath.split('/').pop() || activeReportPath, missing: true }]
                : reports

              return merged.map(report => {
                const title = titleFromReportPath(report.path)
                const isActive = activeReportPath === report.path
                const isPinned = pinnedReportPath === report.path
                return (
                  <div
                    key={report.path}
                    className={`ui-inspector-item ${isActive ? 'ui-inspector-item--active' : ''} ${report.missing ? 'ui-inspector-item--missing' : ''}`}
                  >
                    <button
                      type="button"
                      className="ui-inspector-item__main flex-1 min-w-0 text-left"
                      onClick={() => setViewingReportPath(report.path)}
                    >
                      <InspectorItemHeading title={title} active={isActive} />
                      <span className="ui-inspector-item__path">
                        {report.path}
                        {report.missing ? ' · file not found' : null}
                      </span>
                    </button>
                    <Toggle
                      checked={isPinned}
                      disabled={report.missing}
                      onChange={event =>
                        onSetActiveReport(event.target.checked ? report.path : null, title)
                      }
                      label={isPinned ? `Deactivate ${title}` : `Activate ${title}`}
                      className="ui-toggle--compact shrink-0"
                    />
                  </div>
                )
              })
            })()}
            {reports.length === 0 && !activeReportPath ? (
              <p className="ui-inspector__empty">
                {reportsError ?? 'No reports in workspace yet'}
              </p>
            ) : null}
          </div>
          {viewingReportPath ? (
            <InspectorReportModal
              path={viewingReportPath}
              onClose={() => setViewingReportPath(null)}
            />
          ) : null}
        </>
      )}

      {tab === 'context' && (
        <>
          <InspectorHint>
            Active contexts scope the chat. Click a context to manage knowledge and connector settings.
          </InspectorHint>
          <div className="ui-inspector__scroll space-y-1">
            {contexts.map(context => {
              const isActive = resolvedActiveContextId === context.id
              return (
                <div
                  key={context.id}
                  className={`ui-inspector-item ${isActive ? 'ui-inspector-item--active' : ''}`}
                >
                  <button
                    type="button"
                    className="ui-inspector-item__main flex-1 min-w-0 text-left"
                    onClick={() => onOpenContextDetail(context.id, context.name)}
                  >
                    <InspectorItemHeading title={context.name} active={isActive} />
                    <span className="ui-inspector-item__path">{getContextFolderPath(context)}</span>
                  </button>
                  <Toggle
                    checked={isActive}
                    onChange={event =>
                      onSetActiveContextId(event.target.checked ? context.id : null)
                    }
                    label={isActive ? `Deactivate ${context.name}` : `Activate ${context.name}`}
                    className="ui-toggle--compact shrink-0"
                  />
                </div>
              )
            })}
            {contexts.length === 0 ? (
              <p className="ui-inspector__empty">No contexts in workspace yet</p>
            ) : null}
          </div>
        </>
      )}
    </aside>
  )
}
