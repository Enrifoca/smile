// Google Calendar connector handler — Google REST API via host.call('google.api', ...).
// Runs in a constrained node:vm sandbox; no require, fetch, or filesystem access.

function str(value) {
  return value == null ? '' : String(value)
}

function clamp(value, min, max) {
  const num = Number(value)
  if (!Number.isFinite(num)) return min
  return Math.max(min, Math.min(max, Math.round(num)))
}

async function calendarApi(host, endpoint, method, body, queryParams) {
  return host.call('google.api', { endpoint, method, body, queryParams })
}

async function loadCalendarScope(host) {
  const ctx = await host.context.get()
  if (!ctx) return { allowedIds: null }

  const raw = ctx.calendarIds
  if (!Array.isArray(raw) || raw.length === 0) {
    return { allowedIds: null }
  }

  const allowedIds = raw.map(str).map(s => s.trim()).filter(Boolean)
  if (!allowedIds.length) {
    return { allowedIds: null }
  }

  return { allowedIds }
}

function isCalendarAllowed(calendarId, allowedIds) {
  if (!allowedIds) return true
  return allowedIds.includes(str(calendarId).trim())
}

function resolveCalendarId(argsCalendarId, scope) {
  const requested = str(argsCalendarId).trim()
  if (requested) {
    if (!isCalendarAllowed(requested, scope.allowedIds)) {
      return { error: `Calendar '${requested}' is not in the context scope: ${(scope.allowedIds || []).join(', ')}.` }
    }
    return { calendarId: requested }
  }

  if (scope.allowedIds && scope.allowedIds.length === 1) {
    return { calendarId: scope.allowedIds[0] }
  }

  if (scope.allowedIds && scope.allowedIds.length > 1) {
    return { error: `Multiple calendars are scoped. Please specify a calendarId from: ${scope.allowedIds.join(', ')}.` }
  }

  return { error: 'No calendarId provided and no calendar scope is set.' }
}

function formatEvent(event) {
  return {
    id: str(event.id),
    calendarId: str(event.calendarId),
    summary: str(event.summary),
    description: str(event.description),
    location: str(event.location),
    start: event.start,
    end: event.end,
    htmlLink: str(event.htmlLink),
    attendees: (event.attendees || []).map(a => ({ email: str(a.email), responseStatus: str(a.responseStatus) })),
    status: str(event.status),
    created: str(event.created),
    updated: str(event.updated),
  }
}

async function handleListCalendars(host) {
  const result = await calendarApi(host, '/calendar/v3/users/me/calendarList', 'GET')
  if (!result.success) return result

  const calendars = (result.data.items || []).map(cal => ({
    id: str(cal.id),
    summary: str(cal.summary),
    description: str(cal.description),
    primary: !!cal.primary,
    accessRole: str(cal.accessRole),
  }))

  return { success: true, data: calendars }
}

async function handleListEvents(host, args) {
  const scope = await loadCalendarScope(host)
  if (scope.error) return { success: false, error: scope.error }

  let calendarIds = []
  const requested = str(args.calendarId).trim()

  if (requested) {
    if (!isCalendarAllowed(requested, scope.allowedIds)) {
      return { success: false, error: `Calendar '${requested}' is not in the context scope.` }
    }
    calendarIds = [requested]
  } else if (scope.allowedIds) {
    calendarIds = scope.allowedIds
  } else {
    return { success: false, error: 'No calendarId provided and no calendar scope is set.' }
  }

  const maxResults = clamp(args.maxResults, 1, 100) || 20
  const timeMin = str(args.timeMin) || new Date().toISOString()
  const timeMax = str(args.timeMax)
  const query = str(args.query)

  const allEvents = []
  for (const calendarId of calendarIds) {
    const queryParams = {
      timeMin,
      maxResults: String(maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
    }
    if (timeMax) queryParams.timeMax = timeMax
    if (query) queryParams.q = query

    const result = await calendarApi(host, `/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, 'GET', undefined, queryParams)
    if (!result.success) return result

    for (const event of result.data.items || []) {
      allEvents.push({ ...formatEvent(event), calendarId })
    }
  }

  allEvents.sort((a, b) => {
    const aStart = a.start?.dateTime || a.start?.date || ''
    const bStart = b.start?.dateTime || b.start?.date || ''
    return aStart.localeCompare(bStart)
  })

  return { success: true, data: { events: allEvents } }
}

async function handleGetEvent(host, args) {
  const scope = await loadCalendarScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const resolved = resolveCalendarId(args.calendarId, scope)
  if (resolved.error) return { success: false, error: resolved.error }

  const eventId = str(args.eventId).trim()
  if (!eventId) return { success: false, error: 'eventId is required.' }

  const result = await calendarApi(host, `/calendar/v3/calendars/${encodeURIComponent(resolved.calendarId)}/events/${encodeURIComponent(eventId)}`, 'GET')
  if (!result.success) return result

  return { success: true, data: formatEvent(result.data) }
}

function parseAttendees(attendeesString) {
  return str(attendeesString)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(email => ({ email }))
}

function buildEventBody(args) {
  const body = {}
  if (args.summary !== undefined) body.summary = str(args.summary)
  if (args.description !== undefined) body.description = str(args.description)
  if (args.location !== undefined) body.location = str(args.location)
  if (args.start) body.start = { dateTime: str(args.start) }
  if (args.end) body.end = { dateTime: str(args.end) }
  if (args.attendees) body.attendees = parseAttendees(args.attendees)
  return body
}

async function handleCreateEvent(host, args) {
  const scope = await loadCalendarScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const resolved = resolveCalendarId(args.calendarId, scope)
  if (resolved.error) return { success: false, error: resolved.error }

  const body = buildEventBody(args)
  if (!body.start || !body.end) {
    return { success: false, error: 'start and end times are required.' }
  }

  const result = await calendarApi(host, `/calendar/v3/calendars/${encodeURIComponent(resolved.calendarId)}/events`, 'POST', body)
  if (!result.success) return result

  return { success: true, data: formatEvent(result.data) }
}

async function handleUpdateEvent(host, args) {
  const scope = await loadCalendarScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const resolved = resolveCalendarId(args.calendarId, scope)
  if (resolved.error) return { success: false, error: resolved.error }

  const eventId = str(args.eventId).trim()
  if (!eventId) return { success: false, error: 'eventId is required.' }

  const body = buildEventBody(args)
  const result = await calendarApi(host, `/calendar/v3/calendars/${encodeURIComponent(resolved.calendarId)}/events/${encodeURIComponent(eventId)}`, 'PATCH', body)
  if (!result.success) return result

  return { success: true, data: formatEvent(result.data) }
}

async function handleDeleteEvent(host, args) {
  const scope = await loadCalendarScope(host)
  if (scope.error) return { success: false, error: scope.error }

  const resolved = resolveCalendarId(args.calendarId, scope)
  if (resolved.error) return { success: false, error: resolved.error }

  const eventId = str(args.eventId).trim()
  if (!eventId) return { success: false, error: 'eventId is required.' }

  const result = await calendarApi(host, `/calendar/v3/calendars/${encodeURIComponent(resolved.calendarId)}/events/${encodeURIComponent(eventId)}`, 'DELETE')
  if (!result.success) return result

  return { success: true, data: { deleted: true, eventId, calendarId: resolved.calendarId } }
}

async function executeTool(name, args, host) {
  switch (name) {
    case 'gcal_list_calendars':
      return handleListCalendars(host)
    case 'gcal_list_events':
      return handleListEvents(host, args)
    case 'gcal_get_event':
      return handleGetEvent(host, args)
    case 'gcal_create_event':
      return handleCreateEvent(host, args)
    case 'gcal_update_event':
      return handleUpdateEvent(host, args)
    case 'gcal_delete_event':
      return handleDeleteEvent(host, args)
    default:
      return { success: false, error: `Unknown tool: ${name}` }
  }
}

async function approveAction(actionType, data, host) {
  return { handled: false }
}

module.exports = { executeTool, approveAction }
