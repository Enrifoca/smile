## Linear Connector Rules

- The connector uses OAuth. The user must connect their Linear account in **Connectors → Linear** before any tool can run.
- When a project context is active, the connector **enforces** `teamKeys` from context settings. Create, search, and update operations outside that list are rejected.
- Use `linear_search_issues` for issue lists. Do not call `linear_get_issue` in a loop.
- Use `linear_get_issue` only when full details are needed for one known issue.
- `linear_create_issue` requires a `teamKey` and `title`. Description supports markdown. Use it only for a single issue.
- `linear_create_issues` creates many issues in one call with a single confirmation. **When creating more than one issue, always use this tool with the full list; never call `linear_create_issue` in a loop.** Each item needs `teamKey` and `title`.
- `linear_update_issue` updates one issue. `linear_update_issues` updates many issues in one call with a single confirmation. **When updating more than one issue, always use `linear_update_issues` with the full list.**
- For `priority`, pass an integer 0-4: 0 = no priority, 1 = urgent, 2 = high, 3 = normal, 4 = low.
- For `state`, pass the workflow state name (e.g. "Backlog", "In Progress", "Done"). Use `linear_get_states` if unsure.
- For `assignee`, pass a user email or name. The connector resolves it to a Linear user ID.
- For `project`, pass the exact project name. The connector resolves it to a project ID.
- Write tools are approved by the UI. Call the write tool directly when arguments are ready.
- If exactly one team is scoped to the active context, use it when the user does not name a team.
- If multiple teams are scoped, ask one focused team question before creating issues.
- Prefer fields that are visible in connector metadata instead of asking the user to list options the connector already knows.
