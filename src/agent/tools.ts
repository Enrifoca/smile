import { z } from 'zod'
import { ToolDefinition } from '../connectors/types'

export const fileListSchema = z.object({
  path: z.string().optional().default('').describe('Relative path to list (empty for root)'),
})

export const fileReadSchema = z.object({
  path: z.string().describe('Relative path to the file'),
})

export const fileReadOcrSchema = z.object({
  path: z.string().describe('Relative path to the PDF, DOCX, PPTX, or image file to read through the configured OCR model'),
})

export const fileWriteSchema = z.object({
  path: z.string().describe('Relative path for the file. Parent directories are created automatically if they do not exist.'),
  content: z.string().describe('Content to write'),
})

export const fileMkdirSchema = z.object({
  path: z.string().describe('Relative path of the directory to create (creates all intermediate directories automatically)'),
})

export const fileSearchSchema = z.object({
  pattern: z.string().describe('File name or glob pattern to search for (e.g., "report.pdf", "*.png", "screenshot*")'),
  directory: z.string().optional().describe('Specific subdirectory to search in (searches all folders if not specified)'),
})

export const fileDeleteSchema = z.object({
  path: z.string().describe('Relative path to the file to delete'),
})

// ============ MEMORY TOOLS ============

export const memoryReadSchema = z.object({
  section: z.enum(['all', 'learned', 'style']).optional().default('all')
    .describe('Which memory area to read. Use "all" to read User Memory plus Learned Notes.'),
})

export const memoryUpdateSchema = z.object({
  section: z.enum(['learned', 'style'])
    .describe('"learned" for ordinary notes/preferences/project rules. "style" only for writing style, tone, or recurring phrases.'),
  content: z.string()
    .describe('The memory entry to save. Be specific and actionable. Example: "User always wants reports in HTML format, never markdown." or "User writes bug summaries starting with the affected area in brackets, e.g. [Login] Button not responding."'),
})

export const memoryDeleteSchema = z.object({
  section: z.enum(['learned', 'style', 'all'])
    .describe('Which memory area to delete from. Use "all" when the user asks to remove a topic everywhere.'),
  query: z.string()
    .describe('Case-insensitive text to match and delete from memory entries, for example "weekly reports" or "reports in markdown".'),
})

// ============ SCRATCHPAD TOOL ============

export const scratchpadWriteSchema = z.object({
  note: z.string().describe('The note to add to your session scratchpad. Use this to record key findings, decisions, or progress so you can refer back without re-running tools. Examples: "Document has 4 sections: Setup, API, Deployment, FAQ. Records to create: 6 total.", "Using the default connector scope and record type for all items."'),
})

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'file_list',
    description: 'List files and folders in the workspace directory.',
    schema: fileListSchema,
    requiresConfirmation: false,
    category: 'file-read',
  },
  {
    name: 'file_read',
    description: 'Read the contents of a file from the workspace. Supports plain text, markdown, CSV, HTML, JSON, PDF, and Word (.docx) files. PDFs and Word documents are parsed with normal text extraction. If a PDF/image/document is scanned, image-based, garbled, or the user explicitly asks for OCR, use file_read_ocr instead.',
    schema: fileReadSchema,
    requiresConfirmation: false,
    category: 'file-read',
  },
  {
    name: 'file_read_ocr',
    description: 'Read a difficult document with the configured OCR model. Use this for scanned/image-based PDFs, images, badly encoded or garbled PDFs, screenshots, or when normal file_read may have missed visual text. Supports PDFs, Word/PowerPoint documents, and image files. Use file_read first for normal text files; use OCR when document fidelity matters.',
    schema: fileReadOcrSchema,
    requiresConfirmation: false,
    category: 'file-read',
  },
  {
    name: 'file_write',
    description: 'Write content to a file in the workspace. Automatically creates parent directories if they do not exist — you do NOT need to create them first.',
    schema: fileWriteSchema,
    requiresConfirmation: false,
    category: 'file-write',
  },
  {
    name: 'file_mkdir',
    description: 'Create a directory (and all parent directories) in the workspace. Use this when you need to create a folder structure before writing files, or when explicitly asked to create a folder.',
    schema: fileMkdirSchema,
    requiresConfirmation: false,
    category: 'file-manage',
  },
  {
    name: 'file_search',
    description: 'Search for files by name or pattern in the workspace. Searches recursively through all folders.',
    schema: fileSearchSchema,
    requiresConfirmation: false,
    category: 'file-read',
  },

  // Memory Tools
  {
    name: 'memory_read',
    description: 'Read User Memory and Learned Notes. Use only when you need exact entries before deleting, deduplicating, or resolving a memory conflict.',
    schema: memoryReadSchema,
    requiresConfirmation: false,
    category: 'memory',
  },
  {
    name: 'memory_update',
    description: 'Save a new Learned Note. Use proactively when: (1) the user explicitly says to remember something, (2) you notice a clear reusable preference, (3) the user corrects you on something they always want done differently.',
    schema: memoryUpdateSchema,
    requiresConfirmation: false,
    category: 'memory',
  },
  {
    name: 'memory_delete',
    description: 'Delete User Memory lines or Learned Notes matching a query. Use when the user asks to forget, erase, remove, cancel, or replace old memory/instructions. After deleting obsolete memory, call memory_update if the user provided a replacement preference.',
    schema: memoryDeleteSchema,
    requiresConfirmation: false,
    category: 'memory',
  },

  // Scratchpad
  {
    name: 'scratchpad_write',
    description: 'Add a note to your session scratchpad — a private, always-visible notepad that persists for the entire conversation turn. Use this to record key facts (e.g. what a document contains, which connector scope or record type to use, how many records to create) so you can refer back to them without re-reading files or re-running searches.',
    schema: scratchpadWriteSchema,
    requiresConfirmation: false,
    category: 'scratchpad',
  },
]

/**
 * Get a tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
  return toolDefinitions.find(t => t.name === name)
}

/**
 * Check if a tool requires user confirmation
 */
export function requiresConfirmation(toolName: string): boolean {
  const tool = getToolDefinition(toolName)
  return tool?.requiresConfirmation ?? false
}

/**
 * Get tools formatted for AI provider
 * This converts our tool definitions to the OpenAI function calling format
 */
export function getToolsForAI(): Array<{
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}> {
  return toolDefinitions.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      // Convert Zod schema to JSON Schema
      parameters: zodToJsonSchema(tool.schema),
    },
  }))
}

/**
 * Convert a Zod schema to JSON Schema format
 * This is a simplified converter for our use case
 */
function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): Record<string, unknown> {
  const shape = schema.shape
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as z.ZodTypeAny
    const typeDef = zodType._def

    // Handle optional types
    const isOptional = zodType.isOptional()
    const innerType = isOptional ? (typeDef as { innerType?: z.ZodTypeAny }).innerType || zodType : zodType

    // Get the base type
    const baseTypeDef = innerType._def
    let jsonType: Record<string, unknown> = {}

    // Determine the JSON Schema type
    if (baseTypeDef.typeName === 'ZodString') {
      jsonType = { type: 'string' }
    } else if (baseTypeDef.typeName === 'ZodNumber') {
      jsonType = { type: 'number' }
    } else if (baseTypeDef.typeName === 'ZodBoolean') {
      jsonType = { type: 'boolean' }
    } else if (baseTypeDef.typeName === 'ZodArray') {
      jsonType = {
        type: 'array',
        items: { type: 'string' }, // Simplified - assumes string arrays
      }
    } else if (baseTypeDef.typeName === 'ZodDefault') {
      // Handle default values
      const defaultInner = (baseTypeDef as { innerType?: z.ZodTypeAny }).innerType
      if (defaultInner?._def.typeName === 'ZodString') {
        jsonType = { type: 'string' }
      } else if (defaultInner?._def.typeName === 'ZodNumber') {
        jsonType = { type: 'number' }
      }
    } else {
      // Default to string for unknown types
      jsonType = { type: 'string' }
    }

    // Add description if available
    if (typeDef.description) {
      jsonType.description = typeDef.description
    } else if (baseTypeDef.description) {
      jsonType.description = baseTypeDef.description
    }

    properties[key] = jsonType

    // Track required fields
    if (!isOptional && baseTypeDef.typeName !== 'ZodDefault') {
      required.push(key)
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  }
}
