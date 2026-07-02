export const MODEL_CONFIG_CHANGED = 'smile:model-config-changed'

export function notifyModelConfigChanged(): void {
  window.dispatchEvent(new Event(MODEL_CONFIG_CHANGED))
}
