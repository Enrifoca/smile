# Brave Search connector

Search the web with the [Brave Search API](https://api.search.brave.com). Results include titles, URLs, and snippets that the agent can cite.

## Install

Install from **Connectors → Catalog** in the app. The package is copied into `<workspace>/.smile/connectors/brave/`.

## Configure

1. Get an API key from [Brave Search API](https://brave.com/search/api/).
2. Open the connector's settings page and paste the key under **Brave Search API key**.

The key is stored securely as `connector:brave:apiKey` and is read by the handler through `host.secrets.get('apiKey')`.

## Tools

- `brave_web_search` — Search the web. Arguments: `query` (required), `count` (optional, default 5, max 20).

## Prompt behavior

When this connector is enabled for the active context, the agent is instructed to:

- Use `brave_web_search` for current events, documentation, or facts not available in the workspace.
- Always cite source URLs when summarizing results.
- Tell the user to check the connector API key if the API returns a 401.
