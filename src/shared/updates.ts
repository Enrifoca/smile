/** Shared update state between main process and renderer. */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'dev-skipped'

export interface UpdateState {
  status: UpdateStatus
  currentVersion?: string
  version?: string
  percent?: number
  message?: string
}

export const INITIAL_UPDATE_STATE: UpdateState = {
  status: 'idle',
}
