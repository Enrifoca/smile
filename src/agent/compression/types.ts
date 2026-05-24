import { ToolCategory } from '../../connectors/types'

export interface CompressionRule {
  maxChars?: number
  maxLines?: number
  headChars?: number
  tailChars?: number
  skip?: boolean
}

export interface CompressToolResultInput {
  toolName: string
  category?: ToolCategory
  connectorId?: string
  text: string
}

export interface CompressToolResultOutput {
  text: string
  compressed: boolean
  originalChars: number
  finalChars: number
}
