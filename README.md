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

- Node.js >= 18
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
   - Delete draft emails by ID

6. `gmail_reply`
   - Reply to existing emails
   - Option to send immediately or save as draft
   - Support for "Reply All" via CC

7. `gmail_get_attachment`
   - Download email attachments
   - Save to disk or return as embedded resource

8. `gmail_bulk_save_attachments`
   - Save multiple attachments in a single operation

9. `gmail_archive` / `gmail_bulk_archive`
   - Move emails out of inbox
   - Support for individual or bulk operations

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

4. `calendar_delete_event`
   - Delete events by ID
   - Option for cancellation notifications

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