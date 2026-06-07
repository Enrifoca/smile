import ContextManagementSection from './connectors/ContextManagementSection'

/**
 * Dedicated top-level view for managing project contexts. Contexts scope the
 * agent to a working folder and per-connector domain; they are activated in
 * chat by typing `/` followed by the context name.
 */
export default function ContextView() {
  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="content-shell page-shell space-y-8">
        <ContextManagementSection />
      </div>
    </div>
  )
}
