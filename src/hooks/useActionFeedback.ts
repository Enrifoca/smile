import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActionStatus } from '../components/ui/types'

const DEFAULT_RESET_MS = 3000

export interface UseActionFeedbackOptions {
  /** How long success/error feedback stays visible before returning to idle. */
  resetMs?: number
}

export function useActionFeedback(options: UseActionFeedbackOptions = {}) {
  const resetMs = options.resetMs ?? DEFAULT_RESET_MS
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<ActionStatus>('idle')
  const timerRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
  }, [])

  const scheduleReset = useCallback((ms = resetMs) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      setStatus('idle')
      timerRef.current = null
    }, ms)
  }, [resetMs])

  const reset = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setStatus('idle')
  }, [])

  const markSuccess = useCallback((ms?: number) => {
    setStatus('success')
    scheduleReset(ms)
  }, [scheduleReset])

  const markError = useCallback((ms?: number) => {
    setStatus('error')
    scheduleReset(ms)
  }, [scheduleReset])

  const run = useCallback(async (
    action: () => void | Promise<void>,
    runOptions?: { successMs?: number; errorMs?: number },
  ): Promise<boolean> => {
    reset()
    setBusy(true)
    try {
      await action()
      markSuccess(runOptions?.successMs)
      return true
    } catch {
      markError(runOptions?.errorMs)
      return false
    } finally {
      setBusy(false)
    }
  }, [markError, markSuccess, reset])

  return {
    busy,
    status,
    /** Alias for `busy` — use whichever reads clearer in context (save vs refresh). */
    saving: busy,
    setBusy,
    setStatus,
    reset,
    markSuccess,
    markError,
    run,
  }
}
