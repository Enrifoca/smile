import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { INITIAL_UPDATE_STATE, type UpdateState } from '../shared/updates'

interface UpdateContextValue {
  state: UpdateState
  appVersion: string
  checkForUpdates: () => Promise<void>
  installUpdate: () => Promise<void>
  dismissToast: () => void
  toastVisible: boolean
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState>(INITIAL_UPDATE_STATE)
  const [appVersion, setAppVersion] = useState('0.0.0')
  const [toastDismissed, setToastDismissed] = useState(false)

  useEffect(() => {
    void window.electronAPI.app.getVersion().then(setAppVersion).catch(() => {})
    return window.electronAPI.updates.onStateChange(next => {
      setState(next)
      if (next.status === 'ready' || next.status === 'downloading' || next.status === 'available') {
        setToastDismissed(false)
      }
    })
  }, [])

  const checkForUpdates = useCallback(async () => {
    const result = await window.electronAPI.updates.check()
    if (result.success && result.data) {
      setState(result.data)
    } else if (result.error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        message: result.error,
      }))
    }
  }, [])

  const installUpdate = useCallback(async () => {
    await window.electronAPI.updates.install()
  }, [])

  const dismissToast = useCallback(() => {
    setToastDismissed(true)
  }, [])

  const toastVisible = !toastDismissed && (
    state.status === 'available'
    || state.status === 'downloading'
    || state.status === 'ready'
  )

  const value = useMemo(
    () => ({
      state,
      appVersion,
      checkForUpdates,
      installUpdate,
      dismissToast,
      toastVisible,
    }),
    [state, appVersion, checkForUpdates, installUpdate, dismissToast, toastVisible],
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useAppUpdates(): UpdateContextValue {
  const context = useContext(UpdateContext)
  if (!context) throw new Error('useAppUpdates must be used within UpdateProvider')
  return context
}
