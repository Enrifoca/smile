import { Button } from './ui/Button'
import { useAppUpdates } from '../context/UpdateContext'

export function UpdateToast() {
  const { state, toastVisible, installUpdate, dismissToast } = useAppUpdates()

  if (!toastVisible) return null

  const title = state.status === 'ready'
    ? 'Update ready'
    : state.status === 'downloading'
      ? 'Downloading update'
      : 'Update available'

  const detail = state.status === 'ready'
    ? `smile:D ${state.version ?? ''} is ready to install.`
    : state.status === 'downloading'
      ? `Downloading smile:D ${state.version ?? ''}${state.percent != null ? ` — ${Math.round(state.percent)}%` : '…'}`
      : `smile:D ${state.version ?? ''} will download in the background.`

  return (
    <div className="ui-update-toast" role="status" aria-live="polite">
      <div className="ui-update-toast-body">
        <p className="ui-update-toast-title">{title}</p>
        <p className="ui-update-toast-detail">{detail.trim()}</p>
        <div className="ui-update-toast-actions">
          {state.status === 'ready' ? (
            <Button variant="primary" size="sm" onClick={() => void installUpdate()}>
              Restart to update
            </Button>
          ) : null}
          {state.status !== 'ready' ? (
            <button type="button" className="ui-update-toast-dismiss" onClick={dismissToast}>
              Dismiss
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
