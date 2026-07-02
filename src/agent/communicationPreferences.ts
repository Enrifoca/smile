import type { UserProfile } from './types'

export const SPECTRUM_STEPS = [0, 25, 50, 75, 100] as const

export function snapSpectrum(value: number): number {
  const clamped = Math.min(100, Math.max(0, Math.round(value)))
  return SPECTRUM_STEPS.reduce(
    (best, step) => (Math.abs(step - clamped) < Math.abs(best - clamped) ? step : best),
    50,
  )
}

export const DEFAULT_COMMUNICATION_PREFERENCES = {
  styleSpectrum: 50,
  detailSpectrum: 50,
  toneSpectrum: 50,
} as const

export function normalizeUserProfile(raw: Partial<UserProfile> | null | undefined): UserProfile {
  const base: UserProfile = {
    ...DEFAULT_COMMUNICATION_PREFERENCES,
    focusProjects: [],
    confirmAllConnectorActions: true,
  }

  if (!raw) return base

  return {
    styleSpectrum: typeof raw.styleSpectrum === 'number' ? snapSpectrum(raw.styleSpectrum) : 50,
    detailSpectrum: typeof raw.detailSpectrum === 'number' ? snapSpectrum(raw.detailSpectrum) : 50,
    toneSpectrum: typeof raw.toneSpectrum === 'number' ? snapSpectrum(raw.toneSpectrum) : 50,
    focusProjects: raw.focusProjects ?? [],
    confirmAllConnectorActions: raw.confirmAllConnectorActions ?? true,
  }
}

function describeSpectrum(value: number, left: string, right: string): string {
  const level = snapSpectrum(value)
  if (level === 0) return `Strongly ${left.toLowerCase()}`
  if (level === 25) return `Leaning ${left.toLowerCase()}`
  if (level === 50) return `Balanced between ${left.toLowerCase()} and ${right.toLowerCase()}`
  if (level === 75) return `Leaning ${right.toLowerCase()}`
  return `Strongly ${right.toLowerCase()}`
}

export function buildCommunicationPreferencesPrompt(profile: UserProfile | null): string {
  if (!profile) return ''

  const style = describeSpectrum(profile.styleSpectrum, 'technical', 'conversational')
  const detail = describeSpectrum(profile.detailSpectrum, 'concise', 'detailed')
  const tone = describeSpectrum(profile.toneSpectrum, 'formal', 'casual')

  return [
    'These user preferences are binding for every response you generate. Adapt your tone, level of detail, and style to match them, without announcing that you are doing so.',
    `- Technical ↔ conversational: ${style} (${profile.styleSpectrum}/100). Prefer precise terminology when technical; use plain language when conversational.`,
    `- Concise ↔ detailed: ${detail} (${profile.detailSpectrum}/100). Match depth to the question without padding or skipping necessary steps.`,
    `- Formal ↔ casual: ${tone} (${profile.toneSpectrum}/100). Adjust register accordingly while staying professional.`,
    profile.focusProjects?.length ? `- Focus scopes: ${profile.focusProjects.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
