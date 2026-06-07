/**
 * Minimal JSON Schema type used to declare connector tool inputs.
 *
 * Declarative plugins ship JSON Schema directly (no zod), so the contract is
 * language-neutral. The host converts this into the provider tool format.
 */
export interface JSONSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null'
  description?: string
  /** For type: 'object'. */
  properties?: Record<string, JSONSchema>
  required?: string[]
  /** For type: 'array'. */
  items?: JSONSchema
  enum?: Array<string | number | boolean>
  default?: unknown
  /** Allow forward-compatible keywords without losing type-safety elsewhere. */
  [keyword: string]: unknown
}
