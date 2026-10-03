# Copilot Instructions — meta-ads-mcp-server

MCP (Model Context Protocol) server exposing the Meta (Facebook) Ads Graph API
(`v22.0`, see `src/constants.ts`) as tools, in TypeScript/Node, using
`@modelcontextprotocol/sdk`.

## Build & run

```bash
npm install
npm run build          # tsc compile src/ -> dist/ (strict mode)
npm run dev            # tsx watch src/index.ts — hot-reload during development
npm run clean           # rm -rf dist
```

- No test suite exists in this repo — there are no `test`/`lint` npm scripts. CI
  (`.github/workflows/ci.yml`) only runs `npm run build` and smoke-tests the
  compiled binary.
- Smoke test after building:
  ```bash
  META_ADS_ACCESS_TOKEN=dummy node dist/index.js
  # → "Meta Ads MCP server running via stdio"
  META_ADS_ACCESS_TOKEN=dummy META_ADS_ENABLE_WRITE_TOOLS=true node dist/index.js
  # → prints a WARNING line, then the same "running via stdio" message
  ```
- Releases are automated: pushes to `master` trigger `.github/workflows/release.yml`,
  which bumps `package.json` version based on the commit message prefix
  (`feat!:`/`BREAKING CHANGE` → major, `feat:` → minor, else patch), tags, and
  publishes to npm. Don't hand-edit the version in `package.json`.

## Architecture

- `src/index.ts` — entry point. Builds one `McpServer`, calls a `register*Tools(server)`
  function from each file in `src/tools/`, then connects either a stdio transport
  (default) or a Streamable HTTP transport (`TRANSPORT=http`, POST `/mcp`, plus a
  `GET /health` endpoint).
- `src/tools/*.ts` — one file per Graph API resource (accounts, campaigns, adsets,
  ads, creatives, media, insights, activities, targeting, pages, budget-schedules,
  pagination). Each exports a single `register<X>Tools(server)` that calls
  `server.registerTool(name, config, handler)` per tool. Tool names are namespaced
  `meta_ads_<verb>_<resource>` (e.g. `meta_ads_get_campaign_by_id`,
  `meta_ads_create_campaign`).
- `src/services/graph-api.ts` — the only place that talks HTTP to the Graph API.
  Key helpers used by every tool file: `fetchNode`/`fetchEdge` (GET), `postNode`
  (POST, form-encoded), `deleteNode` (DELETE), `prepareParams` (encodes arrays/
  objects into the JSON-string or CSV form Meta's API expects), `getAccessToken`
  (reads `--access-token` CLI arg or `META_ADS_ACCESS_TOKEN` env var, cached),
  and `handleApiError` (maps Axios/Graph API errors to actionable messages by
  HTTP status code).
- `src/schemas/common.ts` and `src/schemas/insights.ts` — shared Zod schemas
  (pagination, date presets/ranges, filtering, effective-status enums, fields)
  reused across tool files so option shapes stay consistent.
- `src/constants.ts` — `FB_API_VERSION`/`FB_GRAPH_URL`, and `isWriteToolsEnabled()`,
  the single feature-flag gate for all mutating tools.

## Key conventions

- **Read vs. write split**: read tools (GET) always register. Write/lifecycle
  tools (create/update/delete/pause/resume/upload) are gated behind
  `if (!isWriteToolsEnabled()) return;` near the bottom of each `register*Tools`
  function — put new mutating tools after that guard, not before it. The flag is
  controlled by `META_ADS_ENABLE_WRITE_TOOLS` (`true`/`1`/`yes`/`on`).
- **Tool handler shape**: every handler wraps its logic in try/catch and returns
  `{ content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data }`
  on success, or `{ content: [{ type: "text", text: handleApiError(error) }] }`
  on failure. Follow this exact pattern for new tools — don't throw from handlers.
- **Tool `annotations`**: every tool declares `readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint` matching its actual behavior (e.g. delete
  tools set `destructiveHint: true`).
- **Param encoding**: never hand-roll JSON-encoding of array/object params. Add
  new keys that the Graph API expects as JSON strings to `JSON_ENCODED_KEYS`, and
  comma-separated keys to `CSV_KEYS`, in `graph-api.ts`, then rely on
  `prepareParams`.
- **Numeric money fields** (`daily_budget`, `lifetime_budget`, `bid_cap`,
  `spend_cap`, etc.) are in account-currency **cents** and sent to the API as
  strings (`String(value)`) — zod schemas validate them as
  `z.number().int().positive()`.
- **Tool descriptions double as documentation**: each `description` string lists
  `Args:`, `Returns:`, and `Examples:` blocks consumed by the LLM client — keep
  this format when adding or editing tools, and keep the README's tool tables
  (and total tool counts) in sync with any added/removed tool.
- **Dangerous ops** (delete, write): prefer exposing pause/resume over delete
  where both exist, and say so in the tool description (see
  `meta_ads_delete_campaign`).
