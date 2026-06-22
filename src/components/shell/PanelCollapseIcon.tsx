interface PanelCollapseIconProps {
  /** Panel is currently visible. */
  expanded: boolean
  /** Which edge the panel attaches to. */
  side: 'left' | 'right'
}

/** Layout sidebar toggle (panel open/close, not directional chevrons). */
export default function PanelCollapseIcon({ expanded, side }: PanelCollapseIconProps) {
  return (
    <svg className="ui-panel-collapse-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      {side === 'left' ? (
        expanded ? (
          <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeWidth={1.5} />
            <rect x="3.5" y="3.5" width="5.5" height="17" rx="1" fill="currentColor" stroke="none" opacity={0.28} />
          </>
        ) : (
          <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeWidth={1.5} />
            <path strokeWidth={1.5} d="M9 3.5v17" />
          </>
        )
      ) : expanded ? (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeWidth={1.5} />
          <rect x="15" y="3.5" width="5.5" height="17" rx="1" fill="currentColor" stroke="none" opacity={0.28} />
        </>
      ) : (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeWidth={1.5} />
          <path strokeWidth={1.5} d="M15 3.5v17" />
        </>
      )}
    </svg>
  )
}
