import { useState } from 'react'
import { ConfirmationViewModel, PendingAction } from '../agent/types'

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

const getActionTitle = (type: string) => {
  if (type.includes('create')) return 'Create record'
  if (type.includes('update')) return 'Update record'
  if (type.includes('comment')) return 'Add comment'
  if (type.includes('transition')) return 'Change status'
  if (type.includes('upload') || type.includes('attachment')) return 'Upload attachment'
  return 'Confirm Action'
}

const getStatusLabel = (status: ActionConfirmProps['status']) => {
  if (status === 'approved') return 'Approved'
  if (status === 'cancelled') return 'Cancelled'
  if (status === 'revision_requested') return 'Revision requested'
  return null
}

const getRiskLabel = (risk: ConfirmationViewModel['risk']) => {
  if (risk === 'high') return 'High impact'
  if (risk === 'medium') return 'Medium impact'
  if (risk === 'low') return 'Low impact'
  return null
}

export default function ActionConfirm({ action, onApprove, onReject, status = 'active' }: ActionConfirmProps) {
  const [expanded, setExpanded] = useState(false)
  const confirmation = action.confirmation
  const items = confirmation?.items || []
  const visibleItems = expanded ? items : items.slice(0, 4)
  const isActive = status === 'active'
  const statusLabel = getStatusLabel(status)
  const riskLabel = getRiskLabel(confirmation?.risk)

  return (
    <div className="my-2 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden max-w-xl text-left">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div>
          <span className="block text-sm font-semibold text-gray-900">
            {confirmation?.title || getActionTitle(action.type)}
          </span>
          {confirmation?.preview ? (
            <span className="block mt-0.5 text-xs text-gray-500">
              {confirmation.preview}
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

      {confirmation?.description ? (
        <div className="px-4 pt-3">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {confirmation.description}
          </p>
        </div>
      ) : null}

      {riskLabel ? (
        <div className="px-4 pt-3">
          <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium ${
            confirmation?.risk === 'high'
              ? 'bg-red-50 text-red-700 border border-red-100'
              : confirmation?.risk === 'medium'
                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                : 'bg-gray-50 text-gray-600 border border-gray-100'
          }`}>
            {riskLabel}
          </span>
        </div>
      ) : null}

      {confirmation?.fields?.length ? (
        <dl className="px-4 py-3 grid gap-2">
          {confirmation.fields.map(field => (
            <div key={field.label} className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
              <dt className="text-gray-500">{field.label}</dt>
              <dd className="text-gray-800 whitespace-pre-wrap break-words">{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {items.length > 0 ? (
        <div className="px-4 py-3">
          <ol className="space-y-1.5">
            {visibleItems.map((item, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-gray-400 tabular-nums select-none w-5 shrink-0">{i + 1}.</span>
                <div className="min-w-0">
                  {item.badge ? (
                    <span className="inline-block text-[11px] font-medium text-neutral-700 bg-neutral-50 border border-neutral-100 rounded px-1.5 py-0.5 mr-1.5">
                      {item.badge}
                    </span>
                  ) : null}
                  <span className="font-medium text-gray-800">{item.title}</span>
                  {item.subtitle ? (
                    <span className="ml-1 text-xs text-gray-500">{item.subtitle}</span>
                  ) : null}
                  {expanded && item.body ? (
                    <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{item.body}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {items.length > 4 ? (
            <button
              onClick={() => setExpanded(v => !v)}
              className="mt-2 text-xs font-medium text-neutral-700 hover:text-neutral-950"
            >
              {expanded ? 'Show less' : `Show ${items.length - 4} more`}
            </button>
          ) : null}
        </div>
      ) : !confirmation ? (
        <div className="px-4 py-3">
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {action.description}
          </p>
        </div>
      ) : null}

      {/* Actions */}
      {isActive ? (
        <>
          <div className="px-4 pb-4 flex items-center gap-2">
            <button
              onClick={onApprove}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-neutral-950 hover:bg-neutral-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <CheckIcon />
              {confirmation?.approveLabel || 'Approve'}
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
