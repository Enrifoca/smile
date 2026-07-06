/**
 * Editable copy for model recommendation callouts in Settings.
 * Update these strings when default model guidance changes.
 */
export const MODEL_RECOMMENDATIONS = {
  reasoning: {
    lead: 'Best picks:',
    body:
      'Kimi K2.6, OpenRouter (Claude 3.7 thinking / o4-mini), or Qwen qwq-32b for reasoning tasks. Pair with a strong general model below for everyday chat.',
  },
  general: {
    lead: 'Best picks:',
    body: 'OpenAI OSS 120B via Groq, GPT-4o via OpenRouter, Grok via xAI, or Qwen Plus — strong cost/performance balance.',
  },
  ocr: {
    lead: 'Best pick:',
    body: 'Mistral Latest for OCR. DeepSeek OCR via DeepInfra if you prefer that provider.',
  },
} as const
