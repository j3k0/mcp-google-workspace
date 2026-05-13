# mcp-google-workspace

## Dev

- `npm test` builds then runs `node --test` against compiled JS in `dist/tools/__tests__/`
- Tests import from `gmail-helpers.ts`, never `gmail.ts` — gmail.ts pulls `googleapis` which crashes on Node ≥ 23
- Use Node 22 to run the server (`/opt/homebrew/opt/node@22/bin/node`); Node 25 fails at import
- For live MCP testing, register in `.mcp.json` (gitignored via `/.*.json`) with the Node 22 binary explicitly, NOT `./launch`
- `/reload-plugins` does not respawn project-scope MCP servers — full Claude Code restart required after rebuilding `dist/`

## Conventions

- Tool-owned IDs: snake_case (`draft_id`, `message_id`); Gmail-API-pass-through: camelCase (`threadId`, `internalDate`)
- Feature gates: `GMAIL_ALLOW_*` env vars; sandbox dirs: `GMAIL_*_DIR`

## Lessons

- [node-version.md](lessons/node-version.md) — Node 25 breaks googleapis transitively
- [test-isolation.md](lessons/test-isolation.md) — Pure helpers in `gmail-helpers.ts`, never `gmail.ts`
- [mcp-local-testing.md](lessons/mcp-local-testing.md) — Wiring `.mcp.json` against the local server
