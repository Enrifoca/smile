import { Badge, Button } from '../ui'

const BackIcon = () => (
  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5m0 0 6-6m-6 6 6 6" />
  </svg>
)

interface ConnectorPageHeaderProps {
  name: string
  description?: string
  integrationLabel?: string | null
  configured?: boolean
  version?: string
  apiVersion?: string
  onBack: () => void
}

export function ConnectorPageHeader({
  name,
  description,
  integrationLabel,
  configured = false,
  version,
  apiVersion,
  onBack,
}: ConnectorPageHeaderProps) {
  return (
    <header className="flex items-start gap-3">
      <Button variant="ghost" size="sm" onClick={onBack} aria-label="Back to catalog">
        <BackIcon />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="ui-page-title">{name}</h1>
          {integrationLabel ? <Badge className="ui-text-meta font-normal">{integrationLabel}</Badge> : null}
          {configured ? <Badge tone="success">Configured</Badge> : null}
        </div>
        {description ? <p className="mt-1 ui-type-ui">{description}</p> : null}
        {version && apiVersion ? (
          <p className="mt-1 ui-text-meta">
            v{version} · api {apiVersion}
          </p>
        ) : null}
      </div>
    </header>
  )
}
