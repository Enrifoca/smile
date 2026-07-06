## Google Calendar Connector Rules

- The connector uses Google OAuth. The user must connect their Google account in **Connectors → Google Calendar** (or any Google connector) before any tool can run.
- When a project context is active, the connector **enforces** `calendarIds` from context settings. Read and write operations outside that list are rejected.
- Use `gcal_list_events` for event lists. Do not call `gcal_get_event` in a loop.
- `gcal_create_event` requires `summary`, `start`, and `end` in ISO 8601 format (e.g. `2026-07-10T10:00:00+02:00`).
- If exactly one calendar is scoped to the active context, use it when the user does not name a calendar.
- If multiple calendars are scoped, ask for the calendar before creating or reading events.
- `gcal_list_calendars` is useful for discovering calendar IDs when setting up a context.
- Write tools are approved by the UI. Call the write tool directly when arguments are ready.
