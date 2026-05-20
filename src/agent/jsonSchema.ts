type ZodDef = {
  typeName?: string
  description?: string
  innerType?: { _def?: ZodDef; shape?: Record<string, unknown> }
  type?: { _def?: ZodDef; shape?: Record<string, unknown> }
  shape?: Record<string, unknown>
  values?: Record<string, unknown>
}

function zodFieldToJsonSchema(field: unknown): Record<string, unknown> {
  const f = field as { _def?: ZodDef; shape?: Record<string, unknown> }
  let def: ZodDef = f._def || {}
  let typeName = def.typeName || 'ZodString'
  let description = def.description || ''

  while (
    typeName === 'ZodOptional' ||
    typeName === 'ZodDefault' ||
    typeName === 'ZodNullable'
  ) {
    const inner = def.innerType
    if (!inner) break
    def = inner._def || {}
    typeName = def.typeName || 'ZodString'
    if (!description && def.description) description = def.description
  }

  const result: Record<string, unknown> = {}
  if (description) result.description = description

  if (typeName === 'ZodString') {
    result.type = 'string'
  } else if (typeName === 'ZodNumber') {
    result.type = 'number'
  } else if (typeName === 'ZodBoolean') {
    result.type = 'boolean'
  } else if (typeName === 'ZodEnum') {
    result.type = 'string'
    result.enum = Object.values(def.values || {})
  } else if (typeName === 'ZodArray') {
    result.type = 'array'
    const itemDef = def.type?._def
    const itemTypeName = itemDef?.typeName || 'ZodString'
    if (itemTypeName === 'ZodObject') {
      result.items = zodObjectToJsonSchema(def.type as { _def?: ZodDef; shape?: Record<string, unknown> })
    } else if (itemTypeName === 'ZodNumber') {
      result.items = { type: 'number' }
    } else {
      result.items = { type: 'string' }
    }
  } else if (typeName === 'ZodObject') {
    return zodObjectToJsonSchema(f as { _def?: ZodDef; shape?: Record<string, unknown> })
  } else {
    result.type = 'string'
  }

  return result
}

function zodObjectToJsonSchema(obj: { _def?: ZodDef; shape?: Record<string, unknown> }): Record<string, unknown> {
  const shape: Record<string, unknown> = obj.shape || (obj._def as { shape?: () => Record<string, unknown> })?.shape?.() || {}
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const [key, value] of Object.entries(shape)) {
    const fieldDef = value as { _def?: ZodDef }
    const typeName = fieldDef._def?.typeName || 'ZodString'
    const isOptional = typeName === 'ZodOptional' || typeName === 'ZodDefault' || typeName === 'ZodNullable'
    properties[key] = zodFieldToJsonSchema(value)
    if (!isOptional) required.push(key)
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

export function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  return zodFieldToJsonSchema(schema)
}
