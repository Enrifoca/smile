import type { ProjectContext } from '../context/types'
import { Button, Toggle } from './ui'

interface ContextHomeViewProps {
  contexts: ProjectContext[]
  activeContextId: string | null
  onSetActiveContextId: (contextId: string | null) => void
  onOpenContextDetail: (contextId: string, name: string) => void
  onNewContext: () => void
}

export default function ContextHomeView({
  contexts,
  activeContextId,
  onSetActiveContextId,
  onOpenContextDetail,
  onNewContext,
}: ContextHomeViewProps) {
  return (
    <div className="ui-page-frame">
      <div className="content-shell page-shell space-y-5">
        <div className="flex items-start justify-between gap-3">
          <p className="ui-page-subtitle">
            Toggle a context for the active chat. Open a row to edit its knowledge and connectors.
          </p>
          <Button variant="primary" size="xs" onClick={onNewContext} className="shrink-0">
            New Context
          </Button>
        </div>

        <div className="ui-context-home-list">
          {contexts.map(context => {
            const isActive = activeContextId === context.id
            return (
              <div
                key={context.id}
                className={`ui-context-home-row ${isActive ? 'ui-context-home-row--active' : ''}`}
              >
                <button
                  type="button"
                  className="ui-context-home-row__main"
                  onClick={() => onOpenContextDetail(context.id, context.name)}
                >
                  <span className="ui-context-home-row__title">{context.name}</span>
                  <span className="ui-context-home-row__path">.smile/contexts/{context.slug}/{context.slug}.md</span>
                </button>
                <Toggle
                  checked={isActive}
                  onChange={event =>
                    onSetActiveContextId(event.target.checked ? context.id : null)
                  }
                  label={`Activate ${context.name}`}
                  className="ui-toggle--compact shrink-0"
                />
              </div>
            )
          })}
          {contexts.length === 0 ? (
            <p className="ui-page-empty">No contexts yet. Create one to scope chat knowledge and connectors.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
