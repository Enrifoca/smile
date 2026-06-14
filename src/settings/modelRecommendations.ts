/**
 * Editable copy for model recommendation callouts in Settings.
 * Update these strings when default model guidance changes.
 */
export const MODEL_RECOMMENDATIONS = {
  reasoning: {
    lead: 'Best picks:',
    body:
      'Kimi K2.6 for reasoning tasks. Pair with a strong general model below for everyday chat.',
  },
  general: {
    lead: 'Best pick:',
    body: 'OpenAI OSS 120B via Groq for general chat — strong cost/performance balance.',
  },
  ocr: {
    lead: 'Best pick:',
    body: 'Mistral Latest for OCR. DeepSeek OCR via DeepInfra if you prefer that provider.',
  },
} as const
