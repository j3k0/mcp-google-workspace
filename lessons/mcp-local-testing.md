# Local MCP testing

To live-test the local server against real Gmail (e.g. after a code change
touching tool behavior), register it in `.mcp.json` at the repo root
(already covered by `.gitignore`'s `/.*.json` rule):

```json
{
  "mcpServers": {
    "mcp-gsuite-local": {
      "command": "/opt/homebrew/opt/node@22/bin/node",
      "args": ["<repo>/dist/server.js"],
      "env": {}
    }
  }
}
```

Workflow:
1. `npm run build` (or `npm test`, which builds first)
2. Fully restart Claude Code — `/reload-plugins` does NOT respawn project
   MCP servers; the running process keeps the old `dist/` in memory.
3. New tool schemas surface after restart.

OAuth tokens live in `.oauth2.*.json` (gitignored). If they're missing,
run `npm run authenticate` first.
