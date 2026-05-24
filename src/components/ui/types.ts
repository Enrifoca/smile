/** Async user-action feedback (save, refresh, connect, etc.). */
export type ActionStatus = 'idle' | 'success' | 'error'

/** @deprecated Use ActionStatus */
export type SaveStatus = ActionStatus

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'
export type PanelVariant = 'soft' | 'emphasis' | 'danger'
export type FeedbackSize = 'sm' | 'md'
