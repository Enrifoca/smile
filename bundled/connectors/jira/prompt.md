## Jira Connector Rules

- When a project context is active, the connector **enforces** `projectKeys` from context settings. Create, search, and update operations outside that list are rejected.
- Use `jira_search_issues` for issue lists. Do not call `jira_get_issue` in a loop.
- Use `jira_get_issue` only when full details are needed for one known issue.
- Use `jira_batch_create_issues` for 2+ issue creations; use `jira_create_issue` only for exactly one issue.
- Use `jira_batch_update_issues` for 2+ issue updates; use `jira_update_issue` only for exactly one issue.
- `jira_update_issue` and `jira_batch_update_issues` support summary, description, priority, assignee, labels, components, fixVersions, versions and custom fields understood by Jira.
- If an update fails, do not retry the same issue in a loop. Report the error and ask the user how to proceed.
- Write tools are approved by the UI. Call the write tool directly when arguments are ready.
- For priority, pass a plain name string (e.g. `"Low"`). The connector converts it to Jira's object format.
- For assignee, pass the account ID, email, or display name.
- `jira_update_issue` / `jira_batch_update_issues` cannot set Epic Link or parent. Epic Link is a site-specific custom field that the Atlassian MCP edit screen does not expose. Ask the user to set it manually in Jira.
- If exactly one project is scoped to the active context, use it when the user does not name a project.
- If multiple projects are scoped, ask one focused project question before creating issues.
- Prefer fields that are visible in connector metadata instead of asking the user to list options the connector already knows.
