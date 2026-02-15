# Google OAuth Setup Guide for MCP Google Workspace

This guide walks you through setting up Google OAuth credentials to use the MCP Google Workspace server with Claude Code.

## Prerequisites

- A Google account (Gmail)
- Node.js >= 18 installed
- The MCP server built (`npm install && npm run build`)

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click the project dropdown at the top and select **New Project**
4. Enter a project name (e.g. "MCP Google Workspace") and click **Create**

> Google Cloud Console is free for this use case. No billing setup or credit card required.

## Step 2: Enable APIs

1. In the left sidebar, go to **APIs & Services** > **Library**
2. Search for **Gmail API**, click it, then click **Enable**
3. Search for **Google Calendar API**, click it, then click **Enable**

## Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** > **OAuth consent screen**
2. Select **External** as the user type, click **Create**
3. Fill in the required fields:
   - **App name**: anything (e.g. "MCP Google Workspace")
   - **User support email**: your Gmail address
   - **Developer contact email**: your Gmail address
4. Click **Save and Continue** through the Scopes section (leave it empty — the server requests scopes automatically)
5. On the **Test users** step, click **Add Users** and enter your Gmail address
6. Click **Save and Continue**, then **Back to Dashboard**

## Step 4: Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **+ Create Credentials** > **OAuth client ID**
3. Application type: **Desktop app**
4. Name: anything (e.g. "MCP")
5. Click **Create**
6. Click **Download JSON** to download the credentials file

## Step 5: Configure the MCP Server

1. Save the downloaded JSON file as `.gauth.json` in the MCP server directory:
   ```
   C:\Users\<your-username>\.mcp\mcp-google-workspace\.gauth.json
   ```

2. Create a `.accounts.json` file in the same directory with your account(s):
   ```json
   {
     "accounts": [
       {
         "email": "your.email@gmail.com",
         "account_type": "personal",
         "extra_info": "Primary Gmail account"
       }
     ]
   }
   ```

   You can add multiple accounts. The `extra_info` field is passed to the AI to provide context about the account.

## Step 6: Register the MCP Server in Claude Code

Run in your terminal (outside of Claude Code):

```bash
claude mcp add -s user google-workspace -- node C:/Users/<your-username>/.mcp/mcp-google-workspace/dist/server.js --gauth-file C:/Users/<your-username>/.mcp/mcp-google-workspace/.gauth.json --accounts-file C:/Users/<your-username>/.mcp/mcp-google-workspace/.accounts.json --credentials-dir C:/Users/<your-username>/.mcp/mcp-google-workspace
```

Or manually add to `~/.claude.json` under a top-level `"mcpServers"` key:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": [
        "C:/Users/<your-username>/.mcp/mcp-google-workspace/dist/server.js",
        "--gauth-file", "C:/Users/<your-username>/.mcp/mcp-google-workspace/.gauth.json",
        "--accounts-file", "C:/Users/<your-username>/.mcp/mcp-google-workspace/.accounts.json",
        "--credentials-dir", "C:/Users/<your-username>/.mcp/mcp-google-workspace"
      ]
    }
  }
}
```

## Step 7: Authorize on First Use

1. Restart Claude Code
2. The MCP server will appear in your connected servers
3. On first use of any Gmail or Calendar tool, a browser window will open
4. Sign in with your Google account and grant access
5. The OAuth token is saved locally as `.oauth2.<email>.json` — you won't need to authorize again unless the token is revoked

## Troubleshooting

### "App not verified" warning
Since your app is in test mode, Google shows a warning. Click **Advanced** > **Go to [app name] (unsafe)** to proceed. This is normal for personal-use apps.

### "redirect_uri_mismatch" error
The server uses `http://localhost:4100/code` as its callback URL. Desktop app OAuth clients handle localhost redirects automatically, so this should not occur. If it does, edit your OAuth client in Google Cloud Console and add `http://localhost:4100/code` as an authorized redirect URI.

### Server not connecting
- Verify `.gauth.json` and `.accounts.json` exist and are valid JSON
- Verify the server is built: `npm run build` in the server directory
- Check that `dist/server.js` exists
- Restart Claude Code after any config changes

## File Reference

| File | Purpose |
|------|---------|
| `.gauth.json` | Google OAuth client credentials (client_id, client_secret) |
| `.accounts.json` | List of Google accounts to use |
| `.oauth2.<email>.json` | Stored OAuth tokens (auto-created on first auth) |
| `.env` | Optional environment variables (e.g. `GMAIL_ALLOW_SENDING=true`) |

## Security Notes

- Never commit `.gauth.json` or `.oauth2.*.json` to version control (they are gitignored)
- The `GMAIL_ALLOW_SENDING` environment variable is `false` by default — drafts and replies are disabled unless explicitly enabled
- OAuth tokens are stored as local JSON files in the credentials directory
