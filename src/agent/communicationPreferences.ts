import type { UserProfile } from './types'

const enumToStyle = { technical: 0, balanced: 50, conversational: 100 } as const
const enumToDetail = { concise: 0, balanced: 50, detailed: 100 } as const
const enumToTone = { formal: 0, balanced: 50, casual: 100 } as const

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

type LegacyProfile = Partial<UserProfile> & {
  style?: keyof typeof enumToStyle
  verbosity?: keyof typeof enumToDetail
  tone?: keyof typeof enumToTone
}

export function normalizeUserProfile(raw: LegacyProfile | null | undefined): UserProfile {
  const base: UserProfile = {
    ...DEFAULT_COMMUNICATION_PREFERENCES,
    focusProjects: [],
    confirmAllConnectorActions: true,
  }

  if (!raw) return base

  const styleSpectrum =
    typeof raw.styleSpectrum === 'number'
      ? snapSpectrum(raw.styleSpectrum)
      : raw.style
        ? enumToStyle[raw.style] ?? 50
        : 50

  const detailSpectrum =
    typeof raw.detailSpectrum === 'number'
      ? snapSpectrum(raw.detailSpectrum)
      : raw.verbosity
        ? enumToDetail[raw.verbosity] ?? 50
        : 50

  const toneSpectrum =
    typeof raw.toneSpectrum === 'number'
      ? snapSpectrum(raw.toneSpectrum)
      : raw.tone
        ? enumToTone[raw.tone] ?? 50
        : 50

  return {
    styleSpectrum: snapSpectrum(styleSpectrum),
    detailSpectrum: snapSpectrum(detailSpectrum),
    toneSpectrum: snapSpectrum(toneSpectrum),
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
    'Communication preferences (follow strictly):',
    `- Technical ↔ conversational: ${style} (${profile.styleSpectrum}/100). Prefer precise terminology when technical; use plain language when conversational.`,
    `- Concise ↔ detailed: ${detail} (${profile.detailSpectrum}/100). Match depth to the question without padding or skipping necessary steps.`,
    `- Formal ↔ casual: ${tone} (${profile.toneSpectrum}/100). Adjust register accordingly while staying professional.`,
    profile.focusProjects?.length ? `- Focus scopes: ${profile.focusProjects.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
