## Jira Connector Rules

- When a project context is active, the connector **enforces** `projectKeys` from context settings. Create, search, and update operations outside that list are rejected.
- Use `jira_search_issues` for issue lists. Do not call `jira_get_issue` in a loop.
- Use `jira_get_issue` only when full details are needed for one known issue.
- Use `jira_batch_create_issues` for 2+ issue creations.
- Use `jira_create_issue` only for exactly one issue.
- Write tools are approved by the UI. Call the write tool directly when arguments are ready.
- For priority, pass a plain name string (e.g. `"Low"`). The connector converts it to Jira's object format.
- If exactly one project is scoped to the active context, use it when the user does not name a project.
- If multiple projects are scoped, ask one focused project question before creating issues.
- Prefer fields that are visible in connector metadata instead of asking the user to list options the connector already knows.
