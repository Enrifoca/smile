export const CHAT_HISTORY_CHANGED = 'smile:chat-history-changed'

export function notifyChatHistoryChanged(): void {
  window.dispatchEvent(new Event(CHAT_HISTORY_CHANGED))
}
