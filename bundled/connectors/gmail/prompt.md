## Gmail Connector Rules

- The connector uses Google OAuth. The user must connect their Google account in **Connectors → Gmail** (or any Google connector) before any tool can run.
- When a project context is active, the connector **enforces** `labels` from context settings on read and label-management tools. Operations outside the scoped labels are rejected.
- Use `gmail_search_messages` for message lists. Do not call `gmail_get_message` in a loop.
- `gmail_get_message` is for full details of one known message.
- `gmail_send_message` sends plain-text email. It requires user approval through the UI.
- `gmail_add_label` and `gmail_remove_label` resolve label names to IDs automatically. Scoped labels must include the target label.
- If no labels are configured in the active context, read tools operate across all mail. To limit scope, add labels in Context settings.
- When the user asks about email, prefer searching with a focused query rather than asking them to provide message IDs.
