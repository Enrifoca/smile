## Jira Connector Context

{{metadata}}

## Jira Connector Rules

- Use `jira_search_issues` for issue lists. Do not call `jira_get_issue` in a loop.
- Use `jira_get_issue` only when full details are needed for one known issue.
- Use `jira_batch_create_issues` for 2+ issue creations.
- Use `jira_create_issue` only for exactly one issue.
- Write tools are approved by the UI. Call the write tool directly when arguments are ready.
- For priority, pass a plain name string (e.g. `"Low"`). The connector converts it to Jira's object format.
- If no project is specified, use monitored projects from context when unambiguous.
- If multiple monitored projects could apply, ask one focused project question.
- Prefer fields that are visible in connector metadata instead of asking the user to list options the connector already knows.
