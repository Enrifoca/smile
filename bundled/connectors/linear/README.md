# Linear connector

Connects smile:D to your Linear workspace so the agent can search, read, create, and update issues.

## How it works

This connector uses **OAuth 2.0 with PKCE**. The desktop app opens a browser tab for you to authorize smile:D, then stores the access token securely in the main process. The connector sandbox never sees the token.

## Setup

1. Open Linear and go to **Settings → Account → API → OAuth application** (or your workspace's OAuth apps section).
2. Create a new OAuth application.
3. Set the **Redirect URI** to exactly the value shown in **Connectors → Linear → OAuth app credentials** in smile:D. It will be:

   ```
   http://127.0.0.1:43737/oauth/callback
   ```

   Only the redirect URI is required for the smile:D integration. The other fields (developer name, website, description, public/private setting, webhooks) can be filled in however you prefer, and webhooks can be left off — this connector calls Linear's GraphQL API directly.

4. Copy the **Client ID** and **Client Secret** from the newly created app.
5. In smile:D, open **Connectors → Linear**, paste the Client ID and Client Secret, then click **Connect**.
6. Authorize Linear in the browser. Once the page shows "Authorization successful" you can close it and return to smile:D.

## Scopes

The connector requests `read` and `write` scopes so it can read teams/projects/issues and create or update issues and comments.

## Team scoping

When a project context is active, the connector enforces the `teamKeys` configured in that context. Issues outside those teams cannot be created, updated, or read.
