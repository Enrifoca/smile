import { useMemo, useState } from 'react'
import { PendingAction } from '../agent/types'

interface ActionConfirmProps {
  action: PendingAction
  onApprove: () => void
  onReject: () => void
  status?: 'active' | 'approved' | 'cancelled' | 'revision_requested'
}

const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
)

const XIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const getActionTitle = (type: string, data?: Record<string, unknown>) => {
  if (type === 'jira_batch_create_issues') {
    const count = (data?.issues as unknown[])?.length ?? 0
    return `Create ${count} Jira Issue${count !== 1 ? 's' : ''}`
  }
  if (type === 'jira_create_issue') return 'Create Jira Issue'
  if (type === 'jira_update_issue') return 'Update Jira Issue'
  if (type === 'jira_add_comment') return 'Add Comment to Jira'
  if (type === 'jira_transition_issue' || type === 'jira_transition') return 'Change Issue Status'
  if (type === 'jira_upload_attachment') return 'Upload Attachment'
  return 'Confirm Action'
}

const getIssueMeta = (issues: Array<Record<string, unknown>>) => {
  const projects = Array.from(new Set(issues.map(i => i.projectKey).filter(Boolean).map(String)))
  const types = Array.from(new Set(issues.map(i => i.issueTypeName || i.issueType).filter(Boolean).map(String)))
  return {
    projectLabel: projects.length === 1 ? projects[0] : `${projects.length} projects`,
    typeLabel: types.length === 1 ? types[0] : `${types.length} issue types`,
  }
}

const getStatusLabel = (status: ActionConfirmProps['status']) => {
  if (status === 'approved') return 'Approved'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'revision_requested') return 'Revision requested'
  return null
}

export default function ActionConfirm({ action, onApprove, onReject, status = 'active' }: ActionConfirmProps) {
  const [expanded, setExpanded] = useState(false)
  const isBatch = action.type === 'jira_batch_create_issues'
  const batchIssues = isBatch
    ? (action.data.issues as Array<Record<string, unknown>>) ?? []
    : null
  const issueMeta = useMemo(() => getIssueMeta(batchIssues || []), [batchIssues])
  const visibleIssues = expanded ? (batchIssues || []) : (batchIssues || []).slice(0, 4)
  const isActive = status === 'active'
  const statusLabel = getStatusLabel(status)

  return (
    <div className="my-2 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden max-w-xl text-left">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div>
          <span className="block text-sm font-semibold text-gray-900">
            {getActionTitle(action.type, action.data)}
          </span>
          {isBatch && batchIssues ? (
            <span className="block mt-0.5 text-xs text-gray-500">
              {issueMeta.projectLabel} · {issueMeta.typeLabel}
            </span>
          ) : null}
        </div>
        {isActive ? (
          <button onClick={onReject} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Cancel">
            <XIcon />
          </button>
        ) : statusLabel ? (
          <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500">
            {statusLabel}
          </span>
        ) : null}
      </div>

      {/* Batch issues list */}
      {isBatch && batchIssues ? (
        <div className="px-4 py-3">
          <ol className="space-y-1.5">
            {visibleIssues.map((issue, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-gray-400 tabular-nums select-none w-5 shrink-0">{i + 1}.</span>
                <div className="min-w-0">
                  <span className="inline-block text-[11px] font-medium text-mirai-700 bg-mirai-50 border border-mirai-100 rounded px-1.5 py-0.5 mr-1.5">
                    {String(issue.issueTypeName || issue.issueType || 'Task')}
                  </span>
                  <span className="font-medium text-gray-800">{String(issue.summary)}</span>
                  {expanded && issue.description ? (
                    <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{String(issue.description)}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {batchIssues.length > 4 ? (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-2 text-xs font-medium text-mirai-600 hover:text-mirai-700"
            >
              {expanded ? 'Show less' : `Show ${batchIssues.length - 4} more`}
            </button>
          ) : null}
        </div>
      ) : (
        /* Single-action description */
        <div className="px-4 py-3">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {action.description}
          </p>
        </div>
      )}

      {/* Actions */}
      {isActive ? (
        <>
          <div className="px-4 pb-4 flex items-center gap-2">
            <button
              onClick={onApprove}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-mirai-600 hover:bg-mirai-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <CheckIcon />
              {isBatch ? `Create all ${batchIssues?.length ?? ''} issues` : 'Approve'}
            </button>
            <button
              onClick={onReject}
              className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
          <div className="px-4 pb-3 -mt-2 text-[11px] text-gray-400">
            To change anything, type it in the chat below.
          </div>
        </>
      ) : status === 'revision_requested' ? (
        <div className="px-4 pb-3 text-[11px] text-gray-400">
          Original proposal kept for reference. A revised version will appear below.
        </div>
      ) : null}
    </div>
  )
}
