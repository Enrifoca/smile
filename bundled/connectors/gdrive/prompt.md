## Google Drive Connector Rules

- The connector uses Google OAuth. The user must connect their Google account in **Connectors → Google Drive** (or any Google connector) before any tool can run.
- When a project context is active, the connector **enforces** `folderIds` from context settings. List, search, create, upload, and move operations outside that list are rejected.
- Use `gdrive_search_files` to find files by name. Do not list and filter manually.
- `gdrive_download_text` returns text content. For Google Docs/Sheets, it exports to the requested MIME type (`text/plain` for Docs, `text/csv` for Sheets).
- `gdrive_upload_file` creates a new plain-text file. For binary or rich formats, use another tool.
- If exactly one folder is scoped to the active context, use it when the user does not name a folder.
- If multiple folders are scoped, ask for the folder before uploading or creating folders.
- Write tools are approved by the UI. Call the write tool directly when arguments are ready.
