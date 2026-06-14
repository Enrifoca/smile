import { JSONSchema } from '../../connectors/contract'
import { Input } from '../ui'

interface GenericContextSettingsProps {
  schema: JSONSchema
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}

function fieldLabel(key: string, fieldSchema: JSONSchema): string {
  if (typeof fieldSchema.title === 'string' && fieldSchema.title.trim()) {
    return fieldSchema.title.trim()
  }
  return key
}

function fieldValueToString(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function parseFieldValue(schema: JSONSchema, raw: string): unknown {
  if (schema.type === 'array') {
    return raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    const num = Number(raw)
    return Number.isFinite(num) ? num : undefined
  }
  if (schema.type === 'boolean') return raw === 'true'
  return raw
}

function fieldPlaceholder(key: string, fieldSchema: JSONSchema): string {
  if (fieldSchema.type === 'array') return 'Comma-separated values'
  return fieldSchema.description || key
}

export function GenericContextSettings({ schema, value, onChange }: GenericContextSettingsProps) {
  const properties = schema.properties
  if (!properties || Object.keys(properties).length === 0) {
    return <p className="text-xs text-neutral-400">This connector declares no per-context configuration.</p>
  }

  return (
    <div className="space-y-3">
      {Object.entries(properties).map(([key, fieldSchema]) => {
        const label = fieldLabel(key, fieldSchema)
        const hint = fieldSchema.description
        return (
          <label key={key} className="block space-y-1.5">
            <span className="text-sm font-medium text-neutral-900">{label}</span>
            {hint ? <span className="block text-xs text-neutral-500">{hint}</span> : null}
            <Input
              value={fieldValueToString(value[key])}
              placeholder={fieldPlaceholder(key, fieldSchema)}
              onChange={event => onChange({ ...value, [key]: parseFieldValue(fieldSchema, event.target.value) })}
            />
          </label>
        )
      })}
    </div>
  )
}
