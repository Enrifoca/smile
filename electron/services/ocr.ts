import { OCRConfig, OCRProvider, getBundledProviderRole, getDefaultModelId } from '../../src/shared/modelCatalog'

export type { OCRConfig, OCRProvider }

export const OCR_MODELS: Record<OCRProvider, string[]> = {
  mistral: getBundledProviderRole('mistral', 'ocr').models.map(model => model.id),
  deepseek: getBundledProviderRole('deepseek', 'ocr').models.map(model => model.id),
}

interface MistralOCRPage {
  index?: number
  markdown?: string
}

interface MistralOCRResponse {
  pages?: MistralOCRPage[]
}

interface DeepSeekOCRResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export class OCRService {
  private config: OCRConfig

  constructor(config: OCRConfig) {
    this.config = config
  }

  async extractPdfText(buffer: Buffer): Promise<string> {
    return this.extractText(buffer, 'application/pdf')
  }

  async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    switch (this.config.provider) {
      case 'mistral':
        return this.extractWithMistral(buffer, mimeType)
      case 'deepseek':
        return this.extractWithDeepSeek(buffer, mimeType)
      default:
        throw new Error(`Unsupported OCR provider: ${this.config.provider}`)
    }
  }

  private async extractWithMistral(buffer: Buffer, mimeType: string): Promise<string> {
    const model = this.config.model || getDefaultModelId('mistral', 'ocr')
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
    const isImage = mimeType.startsWith('image/')

    const response = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        document: isImage ? {
          type: 'image_url',
          image_url: { url: dataUrl },
        } : {
          type: 'document_url',
          document_url: dataUrl,
        },
        include_image_base64: false,
        table_format: 'markdown',
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const message = (error as { message?: string; error?: { message?: string } }).error?.message
        || (error as { message?: string }).message
        || `Mistral OCR API error: ${response.status}`
      throw new Error(message)
    }

    const data = await response.json() as MistralOCRResponse
    const text = data.pages
      ?.map(page => page.markdown?.trim() || '')
      .filter(Boolean)
      .join('\n\n')
      .trim()

    if (!text) throw new Error('Mistral OCR returned no text')
    return text
  }

  private async extractWithDeepSeek(buffer: Buffer, mimeType: string): Promise<string> {
    const model = this.config.model || getDefaultModelId('deepseek', 'ocr')
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`

    const response = await fetch('https://api.deepinfra.com/v1/openai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all readable text from this document. Preserve headings, paragraphs, lists, and tables in Markdown. Return only the extracted document text.',
            },
            {
              type: 'image_url',
              image_url: { url: dataUrl },
            },
          ],
        }],
        max_tokens: 8192,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const message = (error as { error?: { message?: string } }).error?.message
        || `DeepSeek OCR API error: ${response.status}`
      throw new Error(message)
    }

    const data = await response.json() as DeepSeekOCRResponse
    const text = data.choices?.[0]?.message?.content?.trim()

    if (!text) throw new Error('DeepSeek OCR returned no text')
    return text
  }
}
