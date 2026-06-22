import type { WorkspaceTab } from '../../shell/types'
import { useChatActivity } from '../../chat/ChatActivityContext'
import { ChatLoadingDots } from '../chat/ChatLoadingDots'

interface WorkspaceTabBarProps {
  tabs: WorkspaceTab[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewChatTab: () => void
}

export default function WorkspaceTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewChatTab,
}: WorkspaceTabBarProps) {
  const chatActivity = useChatActivity()
  void chatActivity.revision

  return (
    <div className="ui-workspace-tabs" role="tablist" aria-label="Open documents">
      {tabs.map(tab => {
        const isRunning =
          tab.kind === 'chat' &&
          tab.chatId != null &&
          chatActivity.getActivity(tab.chatId)?.kind === 'running'
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeTabId}
            className={`ui-workspace-tab ${tab.id === activeTabId ? 'ui-workspace-tab--active' : ''}`}
          >
            <button
              type="button"
              className="ui-workspace-tab__select"
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="ui-workspace-tab__label-row">
                <span className="ui-workspace-tab__label">{tab.title}</span>
                {isRunning ? (
                  <ChatLoadingDots className="ui-workspace-tab__spinner" aria-label="Agent working" />
                ) : null}
              </span>
            </button>
            <button
              type="button"
              className="ui-workspace-tab__close ui-chrome-icon-btn"
              aria-label={`Close ${tab.title}`}
              onClick={() => onCloseTab(tab.id)}
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="ui-workspace-tab__add ui-chrome-icon-btn"
        title="New chat tab"
        onClick={onNewChatTab}
      >
        +
      </button>
    </div>
  )
}
