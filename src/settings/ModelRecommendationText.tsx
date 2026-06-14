import { MODEL_RECOMMENDATIONS } from './modelRecommendations'

/** Callout copy with bold on the lead only (e.g. "Best pick:"). */
export function ModelRecommendationText({ section }: { section: keyof typeof MODEL_RECOMMENDATIONS }) {
  const { lead, body } = MODEL_RECOMMENDATIONS[section]
  return (
    <>
      <strong>{lead}</strong> {body}
    </>
  )
}
