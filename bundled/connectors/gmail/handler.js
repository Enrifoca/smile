// Gmail connector handler — Google REST API via host.call('google.api', ...).
// Runs in a constrained node:vm sandbox; no require, fetch, or filesystem access.

function str(value) {
  return value == null ? '' : String(value)
}

function clamp(value, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return min
  return Math.max(min, Math.min(max, Math.round(num)))
}

// Minimal UTF-8 -> base64url encoder for building Gmail raw messages.
function utf8ToBytes(string) {
  const out = []
  for (let i = 0; i < string.length; i++) {
    let c = string.charCodeAt(i)
    if (c < 0x80) {
      out.push(c)
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c < 0xd800 || c >= 0xe000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    } else {
      i++
      c = 0x10000 + (((c & 0x3ff) << 10) | (string.charCodeAt(i) & 0x3ff))
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  return out
}

function base64UrlEncode(string) {
  const bytes = utf8ToBytes(string)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]
    const b2 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b3 = i + 2 < bytes.length ? bytes[i + 2] : 0
    result += chars[b1 >> 2]
    result += chars[((b1 & 3) << 4) | (b2 >> 4)]
    result += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '='
    result += i + 2 < bytes.length ? chars[b3 & 63] : '='
  }
  return result.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function gmailApi(host, endpoint, method, body, queryParams) {
  return host.call('google.api', { endpoint, method, body, queryParams })
}

async function loadLabelScope(host) {
  const ctx = await host.context.get()
  if (!ctx) return { allowedLabels: null }

  const raw = ctx.labels
  if (!Array.isArray(raw) || raw.length === 0) {
    return { allowedLabels: null }
  }

  const allowedLabels = raw.map(str).map(s => s.trim()).filter(Boolean)
  if (!allowedLabels.length) {
    return { allowedLabels: null }
  }

  return { allowedLabels }
}

async function fetchLabels(host) {
  const result = await gmailApi(host, '/gmail/v1/users/me/labels', 'GET')
  if (!result.success) return result
  const labels = (result.data.labels || []).map(label => ({
    id: str(label.id),
    name: str(label.name),
    type: str(label.type),
  }))
  return { success: true, data: labels }
}

async function resolveLabelIds(host, names) {
  const labelsResult = await fetchLabels(host)
  if (!labelsResult.success) return labelsResult

  const map = {}
  for (const name of names) {
    const normalized = str(name).trim()
    const found = labelsResult.data.find(l => l.name.toLowerCase() === normalized.toLowerCase())
    if (found) {
      map[normalized.toLowerCase()] = found.id
    }
  }

  return { success: true, data: map }
}

function buildScopedQuery(query, allowedLabelIds) {
  if (!allowedLabelIds || allowedLabelIds.length === 0) return str(query)
  const labelClauses = allowedLabelIds.map(id => `label:${id}`).join(' OR ')
  const base = str(query).trim()
  return base ? `(${base}) AND (${labelClauses})` : labelClauses
}

function messageHasAllowedLabel(messageLabelIds, allowedLabelIds) {
  if (!allowedLabelIds || allowedLabelIds.length === 0) return true
  if (!Array.isArray(messageLabelIds)) return false
  return messageLabelIds.some(id => allowedLabelIds.includes(id))
}

function extractPlainTextBody(payload) {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return payload.body.data
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const found = extractPlainTextBody(part)
      if (found) return found
    }
  }
  return ''
}

function base64UrlDecodeBytes(data) {
  const padded = data.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((data.length + 3) % 4)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes = []
  let buffer = 0
  let bits = 0
  for (let i = 0; i < padded.length; i++) {
    const c = padded.charAt(i)
    if (c === '=') break
    const val = chars.indexOf(c)
    if (val < 0) continue
    buffer = (buffer << 6) | val
    bits += 6
    while (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return bytes
}

function utf8BytesToString(bytes) {
  let result = ''
  let i = 0
  while (i < bytes.length) {
    const c = bytes[i]
    if (c < 0x80) {
      result += String.fromCharCode(c)
      i++
    } else if ((c & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      result += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
      i += 2
    } else if ((c & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      result += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f))
      i += 3
    } else if ((c & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      let codepoint = ((c & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f)
      codepoint -= 0x10000
      result += String.fromCharCode(0xd800 + (codepoint >> 10), 0xdc00 + (codepoint & 0x3ff))
      i += 4
    } else {
      result += String.fromCharCode(c)
      i++
    }
  }
  return result
}

function decodeBodyData(data) {
  if (!data) return ''
  return utf8BytesToString(base64UrlDecodeBytes(data))
}

function formatMessage(message, labelMap) {
  const headers = (message.payload?.headers || [])
  const getHeader = name => {
    const h = headers.find(h => str(h.name).toLowerCase() === name.toLowerCase())
    return h ? str(h.value) : ''
  }

  const labelNames = (message.labelIds || [])
    .map(id => {
      const found = labelMap ? Object.entries(labelMap).find(([, value]) => value === id) : null
      return found ? found[0] : id
    })

  const rawBody = extractPlainTextBody(message.payload)
  const body = decodeBodyData(rawBody)

  return {
    id: str(message.id),
    threadId: str(message.threadId),
    subject: getHeader('subject'),
    from: getHeader('from'),
    to: getHeader('to'),
    date: getHeader('date'),
    snippet: str(message.snippet),
    labelIds: message.labelIds || [],
    labelNames,
    body,
  }
}

function formatLabel(label) {
  return {
    id: label.id,
    name: label.name,
    type: label.type,
  }
}

async function handleListLabels(host) {
  const result = await fetchLabels(host)
  if (!result.success) return result
  return { success: true, data: result.data.map(formatLabel) }
}

async function handleSearchMessages(host, args) {
  const scope = await loadLabelScope(host)
  if (scope.error) return { success: false, error: scope.error }

  let allowedLabelIds = null
  if (scope.allowedLabels) {
    const idsResult = await resolveLabelIds(host, scope.allowedLabels)
    if (!idsResult.success) return idsResult
    allowedLabelIds = Object.values(idsResult.data)
    if (allowedLabelIds.length === 0) {
      return { success: false, error: `None of the scoped labels exist: ${scope.allowedLabels.join(', ')}.` }
    }
  }

  const maxResults = clamp(args.maxResults, 1, 100) || 20
  const q = buildScopedQuery(args.query, allowedLabelIds)
  const result = await gmailApi(host, '/gmail/v1/users/me/messages', 'GET', undefined, {
    q,
    maxResults: String(maxResults),
  })

  if (!result.success) return result

  const labelMap = scope.allowedLabels ? (await resolveLabelIds(host, scope.allowedLabels)).data : {}
  const messages = (result.data.messages || []).map(m => ({
    id: str(m.id),
    threadId: str(m.threadId),
  }))

  return { success: true, data: { query: q, messages, totalEstimate: result.data.resultSizeEstimate } }
}

async function handleGetMessage(host, args) {
  const messageId = str(args.id).trim()
  if (!messageId) return { success: false, error: 'Message id is required.' }

  const scope = await loadLabelScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const result = await gmailApi(host, `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`, 'GET', undefined, {
    format: 'full',
  })

  if (!result.success) return result

  let allowedLabelIds = null
  if (scope.allowedLabels) {
    const idsResult = await resolveLabelIds(host, scope.allowedLabels)
    if (!idsResult.success) return idsResult
    allowedLabelIds = Object.values(idsResult.data)
    if (allowedLabelIds.length === 0) {
      return { success: false, error: `None of the scoped labels exist: ${scope.allowedLabels.join(', ')}.` }
    }
  }

  if (!messageHasAllowedLabel(result.data.labelIds, allowedLabelIds)) {
    return { success: false, error: `Message ${messageId} is outside the scoped labels.` }
  }

  const labelMap = scope.allowedLabels ? (await resolveLabelIds(host, scope.allowedLabels)).data : {}
  return { success: true, data: formatMessage(result.data, labelMap) }
}

async function handleSendMessage(host, args) {
  const to = str(args.to).trim()
  const subject = str(args.subject)
  const body = str(args.body)
  const cc = str(args.cc).trim()
  const bcc = str(args.bcc).trim()

  if (!to) return { success: false, error: 'Recipient (to) is required.' }

  let message = `To: ${to}\n`
  if (cc) message += `Cc: ${cc}\n`
  if (bcc) message += `Bcc: ${bcc}\n`
  message += `Subject: ${subject}\n\n${body}`

  const raw = base64UrlEncode(message)
  const result = await gmailApi(host, '/gmail/v1/users/me/messages/send', 'POST', { raw })

  if (!result.success) return result
  return { success: true, data: { id: str(result.data.id), threadId: str(result.data.threadId) } }
}

async function handleAddLabel(host, args) {
  const messageId = str(args.messageId).trim()
  const labelName = str(args.labelName).trim()

  if (!messageId) return { success: false, error: 'messageId is required.' }
  if (!labelName) return { success: false, error: 'labelName is required.' }

  const scope = await loadLabelScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const idsResult = await resolveLabelIds(host, scope.allowedLabels || [labelName])
  if (!idsResult.success) return idsResult

  const labelId = idsResult.data[labelName.toLowerCase()]
  if (!labelId) return { success: false, error: `Label '${labelName}' not found.` }

  if (scope.allowedLabels && !scope.allowedLabels.some(l => l.toLowerCase() === labelName.toLowerCase())) {
    return { success: false, error: `Label '${labelName}' is not in the context scope: ${scope.allowedLabels.join(', ')}.` }
  }

  const result = await gmailApi(host, `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`, 'POST', {
    addLabelIds: [labelId],
  })

  if (!result.success) return result
  return { success: true, data: { messageId, labelAdded: labelName } }
}

async function handleRemoveLabel(host, args) {
  const messageId = str(args.messageId).trim()
  const labelName = str(args.labelName).trim()

  if (!messageId) return { success: false, error: 'messageId is required.' }
  if (!labelName) return { success: false, error: 'labelName is required.' }

  const scope = await loadLabelScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const idsResult = await resolveLabelIds(host, scope.allowedLabels || [labelName])
  if (!idsResult.success) return idsResult

  const labelId = idsResult.data[labelName.toLowerCase()]
  if (!labelId) return { success: false, error: `Label '${labelName}' not found.` }

  if (scope.allowedLabels && !scope.allowedLabels.some(l => l.toLowerCase() === labelName.toLowerCase())) {
    return { success: false, error: `Label '${labelName}' is not in the context scope: ${scope.allowedLabels.join(', ')}.` }
  }

  const result = await gmailApi(host, `/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`, 'POST', {
    removeLabelIds: [labelId],
  })

  if (!result.success) return result
  return { success: true, data: { messageId, labelRemoved: labelName } }
}

async function executeTool(name, args, host) {
  switch (name) {
    case 'gmail_list_labels':
      return handleListLabels(host)
    case 'gmail_search_messages':
      return handleSearchMessages(host, args)
    case 'gmail_get_message':
      return handleGetMessage(host, args)
    case 'gmail_send_message':
      return handleSendMessage(host, args)
    case 'gmail_add_label':
      return handleAddLabel(host, args)
    case 'gmail_remove_label':
      return handleRemoveLabel(host, args)
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

async function approveAction(actionType, data, host) {
  return { handled: false }
}

module.exports = { executeTool, approveAction }
