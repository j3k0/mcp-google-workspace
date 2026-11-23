# MCP Google Workspace Server

A Model Context Protocol server for Google Workspace services. This server provides tools to interact with Gmail and Google Calendar through the MCP protocol.

## Features

- **Multiple Google Account Support**
  - Use and switch between multiple Google accounts
  - Each account can have custom metadata and descriptions

- **Gmail Integration**
  - Query emails with advanced search
  - Read full email content and attachments
  - Create and manage drafts
  - Reply to emails
  - Archive emails
  - Handle attachments
  - Bulk operations support

- **Calendar Integration**
  - List available calendars
  - View calendar events
  - Create new events
  - Delete events
  - Support for multiple calendars
  - Custom timezone support

## Example Prompts

Try these example prompts with your AI assistant:

### Gmail
- "Retrieve my latest unread messages"
- "Search my emails from the Scrum Master"
- "Retrieve all emails from accounting"
- "Take the email about ABC and summarize it"
- "Write a nice response to Alice's last email and upload a draft"
- "Reply to Bob's email with a Thank you note. Store it as draft"

### Calendar
- "What do I have on my agenda tomorrow?"
- "Check my private account's Family agenda for next week"
- "I need to plan an event with Tim for 2hrs next week. Suggest some time slots"

## Prerequisites

- Node.js >= 20
- A Google Cloud project with Gmail and Calendar APIs enabled
- OAuth 2.0 credentials for Google APIs

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/j3k0/mcp-google-workspace.git
   cd mcp-google-workspace
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the TypeScript code:
   ```bash
   npm run build
   ```

## Configuration

### OAuth 2.0 Setup

Google Workspace (G Suite) APIs require OAuth2 authorization. Follow these steps to set up authentication:

1. Create OAuth2 Credentials:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Gmail API and Google Calendar API for your project
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Select "Desktop app" or "Web application" as the application type
   - Configure the OAuth consent screen with required information
   - Add authorized redirect URIs (include `http://localhost:4100/code` for local development)

2. Required OAuth2 Scopes:
   ```json
   [
     "openid",
     "https://mail.google.com/",
     "https://www.googleapis.com/auth/gmail.settings.basic",
     "https://www.googleapis.com/auth/calendar",
     "https://www.googleapis.com/auth/userinfo.email"
   ]
   ```

3. Create a `.gauth.json` file in the project root with your Google OAuth 2.0 credentials:
   ```json
   {
     "installed": {
       "client_id": "your_client_id",
       "project_id": "your_project_id",
       "auth_uri": "https://accounts.google.com/o/oauth2/auth",
       "token_uri": "https://oauth2.googleapis.com/token",
       "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
       "client_secret": "your_client_secret",
       "redirect_uris": ["http://localhost:4100/code"]
     }
   }
   ```

4. Create a `.accounts.json` file to specify which Google accounts can use the server:
   ```json
   {
     "accounts": [
       {
         "email": "your.email@gmail.com",
         "account_type": "personal",
         "extra_info": "Primary account with Family Calendar"
       }
     ]
   }
   ```

   You can specify multiple accounts. Make sure they have access in your Google Auth app. The `extra_info` field is especially useful as you can add information here that you want to tell the AI about the account (e.g., whether it has a specific calendar).

### Authenticate

Once `.gauth.json` and `.accounts.json` are configured, authenticate your accounts:

```bash
npm run authenticate
```

This opens a browser for each configured account to complete the OAuth consent flow. The script waits up to 5 minutes per account for the callback.

```bash
# Authenticate a specific account
npm run authenticate -- user@gmail.com

# Force re-authentication (e.g. after OAuth scope changes)
npm run authenticate -- user@gmail.com --force

# Custom config paths (same flags as the server)
npm run authenticate -- --gauth-file /path/to/.gauth.json --accounts-file /path/to/.accounts.json
```

If installed via npm, you can also run:

```bash
npx mcp-gmail-authenticate
```

### Claude Desktop Configuration

Configure Claude Desktop to use the mcp-google-workspace server:

On MacOS: Edit `~/Library/Application\ Support/Claude/claude_desktop_config.json`

On Windows: Edit `%APPDATA%/Claude/claude_desktop_config.json`

<details>
  <summary>Development/Unpublished Servers Configuration</summary>
  
```json
{
  "mcpServers": {
    "mcp-google-workspace": {
      "command": "<dir_to>/mcp-google-workspace/launch"
    }
  }
}
```
</details>

<details>
  <summary>Published Servers Configuration</summary>
  
```json
{
  "mcpServers": {
    "mcp-google-workspace": {
      "command": "npx",
      "args": [
        "mcp-google-workspace"
      ]
    }
  }
}
```
</details>

### Docker

You can also build and run the MCP server in Docker:

```bash
docker build -t mcp-google-workspace .
docker run --rm -i \
  -v "$PWD/.gauth.json:/app/.gauth.json:ro" \
  -v "$PWD/.accounts.json:/app/.accounts.json:ro" \
  -v "$PWD/.credentials:/app/.credentials" \
  -e GMAIL_ALLOW_DRAFTS=true \
  -e GMAIL_ATTACHMENTS_DIR=/app/attachments \
  mcp-google-workspace \
  node dist/server.js --credentials-dir /app/.credentials
```

Do not bake `.gauth.json`, `.accounts.json`, OAuth tokens, or `.env` files into the image. The included `.dockerignore` excludes those files; mount them at runtime instead.

## Usage

1. Start the server:
   ```bash
   npm start
   ```

   Optional arguments:
   - `--gauth-file`: Path to the OAuth2 credentials file (default: ./.gauth.json)
   - `--accounts-file`: Path to the accounts configuration file (default: ./.accounts.json)
   - `--credentials-dir`: Directory to store OAuth credentials (default: current directory)

2. The server will start and listen for MCP commands via stdin/stdout.

3. On first run for each account, it will:
   - Open a browser window for OAuth2 authentication
   - Listen on port 4100 for the OAuth2 callback
   - Store the credentials for future use in a file named `.oauth2.{email}.json`

### Environment Variables

- `GMAIL_ALLOW_SENDING` — set to `true` to allow `gmail_send` to actually send mail. Defaults to disabled.
- `GMAIL_ALLOW_DRAFTS` — set to `true` to allow draft creation tools. Defaults to disabled.
- `GMAIL_ATTACHMENTS_DIR` — base directory under which `gmail_get_attachment` and `gmail_bulk_save_attachments` may write files. Attachment paths supplied by the caller are treated as relative to this directory; absolute paths, traversal, and symlinks that escape the directory are rejected. Defaults to `~/.mcp-gsuite/attachments`.

## Available Tools

### Account Management

1. `gmail_list_accounts` / `calendar_list_accounts`
   - List all configured Google accounts
   - View account metadata and descriptions
   - No user_id required

### Gmail Tools

1. `gmail_query_emails`
   - Search emails with Gmail's query syntax (e.g., 'is:unread', 'from:example@gmail.com', 'newer_than:2d', 'has:attachment')
   - Returns emails in reverse chronological order
   - Includes metadata and content summary

2. `gmail_get_email`
   - Retrieve complete email content by ID
   - Includes full message body and attachment info

3. `gmail_bulk_get_emails`
   - Retrieve multiple emails by ID in a single request
   - Efficient for batch processing

4. `gmail_create_draft`
   - Create new email drafts
   - Support for CC recipients

5. `gmail_delete_draft`
   - Delete draft emails by `draft_id`
   - Note: `draft_id` is distinct from the message ID returned by `gmail_query_emails`. Use `gmail_list_drafts` to obtain it.

6. `gmail_list_drafts`
   - List Gmail drafts, optionally filtered by a Gmail search query
   - Returns each draft's `draft_id` (required for `gmail_delete_draft`) alongside its `message_id`, subject, recipients, and snippet

7. `gmail_reply`
   - Reply to existing emails
   - Option to send immediately or save as draft
   - Support for "Reply All" via CC

8. `gmail_get_attachment`
   - Download a single email attachment by `message_id` + `attachment_id`
   - `attachment_id` must be the `attachmentId` string from `gmail_get_email` / `gmail_bulk_get_emails` — not the numeric part-index key (e.g. `"1"`) that those tools use to key the `attachments` map
   - Save to disk (`save_to_disk`) or return as embedded resource. Save paths are sandboxed — see `GMAIL_ATTACHMENTS_DIR` above.

9. `gmail_bulk_save_attachments`
   - Save multiple attachments in a single operation
   - Same `attachment_id` requirement as `gmail_get_attachment` (see above) — each item in `attachments` needs `message_id`, `attachment_id`, `save_path`

10. `gmail_archive` / `gmail_bulk_archive`
    - Move emails out of inbox by removing the `INBOX` label (does **not** trash them)
    - `gmail_bulk_archive` issues one API call per message; for large batches prefer `gmail_bulk_modify` with `remove_labels: ["INBOX"]`, which uses `batchModify`

11. `gmail_list_labels`
    - Lists Gmail labels (id, name, type) for the account
    - Use this to find the label `id` for any user-defined label before passing it to `gmail_bulk_modify` — user labels must be referenced by id, not by their display name

12. `gmail_bulk_modify`
    - Adds and/or removes labels on many messages via a single `batchModify` request (up to 1000 message IDs per underlying request; longer lists are chunked automatically)
    - Takes label **IDs**, not names. Common system IDs: `TRASH`, `INBOX`, `UNREAD`, `STARRED`, `IMPORTANT`, `SPAM`
    - Examples: trash → `add_labels: ["TRASH"]`; archive → `remove_labels: ["INBOX"]`; mark read → `remove_labels: ["UNREAD"]`

> **Sending and drafting are disabled by default.** `gmail_create_draft` and `gmail_reply` are only registered as tools when `GMAIL_ALLOW_SENDING=true` or `GMAIL_ALLOW_DRAFTS=true` is set. Without either, the server doesn't expose them at all. `GMAIL_ALLOW_DRAFTS` unlocks the tools in draft-only mode — `gmail_reply` still can't actually send (`send` is forced `false`) unless `GMAIL_ALLOW_SENDING=true` specifically. This is intentional, so an AI assistant can't send, or even draft, email on your behalf unless you've explicitly opted in.

### Calendar Tools

1. `calendar_list`
   - List all accessible calendars
   - Includes calendar metadata, access roles, and timezone information

2. `calendar_get_events`
   - Retrieve events in a date range
   - Support for multiple calendars
   - Filter options (deleted events, max results)
   - Timezone customization

3. `calendar_create_event`
   - Create new calendar events
   - Support for attendees and notifications
   - Location and description fields
   - Timezone handling

4. `calendar_update_event`
   - Update an existing event by `event_id`; only the fields you pass are changed (partial update via `events.patch`)
   - `attendees` replaces the entire attendee list; `add_attendees` appends to the existing list instead, de-duplicating against current attendees
   - `send_notifications` (default `true`) controls whether attendees get an update email

5. `calendar_delete_event`
   - Delete events by ID
   - Option for cancellation notifications

## How the API calls work

### IDs: use the value the API gave you, not an index

Several tools accept an ID that must come verbatim from a prior tool's output — passing a derived value (like an array index or map key) fails with an opaque error instead of a helpful one:

- `gmail_get_attachment` / `gmail_bulk_save_attachments` need the `attachmentId` string found inside the `attachments` map returned by `gmail_get_email` / `gmail_bulk_get_emails`. That map is keyed by a small numeric string (e.g. `"1"`) for the MIME part index — that key is *not* the attachment ID and will fail with `Invalid attachment token`.
- Save paths for those same two tools are relative to `GMAIL_ATTACHMENTS_DIR` (default `~/.mcp-gsuite/attachments`) — absolute paths, `..` traversal, and symlinks that escape the directory are all rejected rather than silently written to.
- `gmail_bulk_modify` needs label **IDs**. System labels (`INBOX`, `UNREAD`, `STARRED`, `TRASH`, `SPAM`, `IMPORTANT`) double as their own IDs, but user-created labels don't — call `gmail_list_labels` first and use the `id` field, not the label's display name.
- `calendar_update_event` / `calendar_delete_event` need the `event_id` from `calendar_get_events`, not the event's summary/title.

### Multi-account routing

Every tool (except the `*_list_accounts` tools) takes a `user_id` argument — the email address of one of the accounts configured in `.accounts.json`. There's no session-level "current account"; each call is routed independently, so batch operations across accounts require separate calls per account.

### Batch size and request shape

- `gmail_bulk_get_emails` / `gmail_bulk_save_attachments` fan out to one Gmail API call per item — no server-side batch endpoint for reads/attachment fetches.
- `gmail_bulk_archive` also issues one `messages.modify` call per message ID.
- `gmail_bulk_modify` is the one truly batched write path: it calls `users.messages.batchModify`, which accepts up to 1000 message IDs per request. Longer lists are automatically split into multiple sequential batch requests — there's no need to chunk them yourself.
- Archiving (`gmail_archive`, `gmail_bulk_archive`, or `gmail_bulk_modify` with `remove_labels: ["INBOX"]`) only removes the `INBOX` label. It never adds `TRASH` — archived mail stays in "All Mail," it isn't deleted.

### Auth and account config

- Each account authenticates independently via OAuth2 (see Configuration below); credentials are cached to `.oauth2.{email}.json` under `--credentials-dir` after the first browser-based auth for that account.
- `gmail_reply` and `gmail_create_draft` are filtered out of the tool list entirely unless `GMAIL_ALLOW_SENDING=true` or `GMAIL_ALLOW_DRAFTS=true` is set — the server won't even advertise those tools otherwise. `GMAIL_ALLOW_DRAFTS` alone still can't send: `gmail_reply`'s `send` argument is forced to `false` unless `GMAIL_ALLOW_SENDING=true` specifically.
- `To`/`Subject`/`Cc`/`In-Reply-To` values passed into `gmail_create_draft`/`gmail_reply` are stripped of `\r`/`\n` before being written into raw RFC822 headers, so a crafted recipient or subject can't inject extra headers (e.g. a hidden `Bcc`).

### Picking up schema changes

`dist/` is gitignored and rebuilt from `src/` via `npm run build`. If you're running this server from an MCP client (Claude Code, Claude Desktop, etc.), rebuilding alone isn't enough — the client caches the tool schemas from when it first connected. Reconnect the MCP server (in Claude Code: `/mcp`, then reconnect `gworkspace`/`mcp-google-workspace`) or restart the client session to pick up schema or behavior changes.

## Development

- Source code is in TypeScript under the `src/` directory
- Build output goes to `dist/` directory
- Uses ES modules for better modularity
- Follows Google API best practices

### Project Structure

```
mcp-google-workspace/
├── src/
│   ├── server.ts           # Main server implementation
│   ├── services/
│   │   └── gauth.ts        # Google authentication service
│   ├── tools/
│   │   ├── gmail.ts        # Gmail tools implementation
│   │   └── calendar.ts     # Calendar tools implementation
│   └── types/
│       └── tool-handler.ts # Common types and interfaces
├── .gauth.json             # OAuth2 credentials
├── .accounts.json          # Account configuration
├── package.json            # Project dependencies
└── tsconfig.json           # TypeScript configuration
```

### Development Commands

- `npm run build`: Build TypeScript code
- `npm start`: Start the server
- `npm run dev`: Start in development mode with auto-reload

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details
