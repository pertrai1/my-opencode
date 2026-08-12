# My Opencode Config

Global configuration for [opencode](https://opencode.ai).

## What's configured

- **Models** — OpenAI `gpt-5.4` (default large), `gpt-5.6-luna` (small/titles). Build runs `gpt-5.4`, Plan runs `gpt-5.6-terra`.
- **Default agent** — Plan.
- **Permissions** — least privilege. Read-only tools and shell commands are allowed; edits, tasks, and mutating shell commands ask; destructive operations (`rm`, `git push`/`clean`/`reset --hard`/`rebase`) are denied. `.env` reads are denied.
- **LSP** — enabled for code intelligence.
- **Compaction** — auto with pruning (12K token reserved buffer).
- **TUI** — `tui.json` (theme, mouse, attention notifications).

## Plugins

- `plugins/rtk.ts` — [RTK](https://github.com/rtk-ai/rtk) command rewriting for token savings. Install via `rtk init -g --opencode`. Track savings with `rtk gain`.
- `plugins/agentmemory-capture.ts` — captures session observations into the agentmemory MCP server. Optional auth via `AGENTMEMORY_SECRET` env var.
- `plugins/crg-plugin.ts` — keeps the [code-review-graph](https://github.com/) knowledge graph updated. Installed by `code-review-graph install --platform opencode`.
- `plugins/herdr-agent-state.js` — herdr agent-state integration. Managed by herdr; reinstalling overwrites it.

## Skills

Engineering skills live in `.agents/skills/` and are auto-discovered by opencode. They come from [mattpocock/skills](https://github.com/mattpocock/skills) and are managed via `npx skills` — update with `npx skills update` (sources are recorded in `skills-lock.json`).

## MCP servers

- **`mdn`** (remote) — MDN Web Docs reference, browser compatibility data. `https://mcp.mdn.mozilla.net/`
- **`llm-core`** (local) — lints files with `eslint-plugin-llm-core` rules. `npx -y eslint-plugin-llm-core-mcp`
- **`agentmemory`** (local) — long-term session memory for `recall`/`remember` commands. `npx -y @agentmemory/mcp` (server: `http://localhost:3111`)

## Commands

- `commands/recall.md` — search past session memory
- `commands/remember.md` — explicitly save a memory

## Replicating this setup

1. `opencode auth login` / `/connect` → OpenAI and paste an API key (or set `OPENAI_API_KEY`)
2. `rtk init -g --opencode` to install the RTK plugin
3. `code-review-graph install --platform opencode` to install the graph plugin
4. herdr install for agent-state reporting
5. `npx skills add mattpocock/skills` and `npx skills update` for the skill library
6. Point `plugins/agentmemory-capture.ts` at an agentmemory server (default `http://localhost:3111`)
