/** Default labels for the write-action bar above the chat composer. Edit here or override via props. */
export const defaultWriteActionBarLabels = {
  approveLabel: 'Accept',
  refuseLabel: 'Refuse',
} as const

export type WriteActionBarLabels = {
  [K in keyof typeof defaultWriteActionBarLabels]?: typeof defaultWriteActionBarLabels[K]
}
