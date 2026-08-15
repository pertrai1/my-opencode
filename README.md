# My Opencode Config

Global configuration for [opencode](https://opencode.ai).

## What's configured

- **Models** — OpenAI `gpt-5.4` (default large), `gpt-5.6-luna` (small/titles). Build runs `gpt-5.4`, Plan runs `gpt-5.6-terra`.
- **Default agent** — Plan.
- **Permissions** — least privilege. Read-only tools and shell commands are allowed; edits, tasks, and mutating shell commands ask; destructive operations (`rm`, `git push`/`clean`/`reset --hard`/`rebase`) are denied. `.env` reads are denied.
- **LSP** — enabled for code intelligence.
- **Compaction** — auto with pruning (12K token reserved buffer).
- **TUI** — `tui.json` (`tokyonight` theme, mouse, attention notifications).

## Plugins

- `plugins/rtk.ts` — [RTK](https://github.com/rtk-ai/rtk) command rewriting for token savings. Install via `rtk init -g --opencode`. Track savings with `rtk gain`.
- `plugins/agentmemory-capture.ts` — captures session observations into the agentmemory MCP server. Optional auth via `AGENTMEMORY_SECRET` env var.
- `plugins/crg-plugin.ts` — keeps the [Code Review Graph](https://code-review-graph.com) knowledge graph updated. Installed by `code-review-graph install --platform opencode`.
- `plugins/herdr-agent-state.js` — herdr agent-state integration. Managed by herdr; reinstalling overwrites it.

## Skills

- `.agents/skills/` — engineering workflow skills from [mattpocock/skills](https://github.com/mattpocock/skills), managed via `npx skills` and updated with `npx skills update` (sources recorded in `skills-lock.json`).
- `skills/gitnexus-*/` — local GitNexus skills for indexing, exploration, debugging, PR review, impact analysis, and refactoring workflows.
- `skills/graphify/` — local Graphify skill for building and querying repository knowledge graphs.

## Agents

- `agents/architecture-boundary-reviewer.md` — reviews diffs for architecture boundary violations.
- `agents/performance-reviewer.md` — reviews diffs for performance risks and optimization opportunities.
- `agents/production-readiness-reviewer.md` — reviews diffs for reliability and production safety risks.
- `agents/test-reviewer.md` — reviews diffs for missing or weak test coverage.

## Type-Driven TDD Pipeline

Separated-agent implementation flow (types → RED → GREEN), modeled on the cg-agent-flow openspec pipeline. Separation defeats confirmation bias: the agent that writes tests never sees the implementation plan, and the agent that writes code can't touch the tests or the type contract.

Run it with `/apply <change or task description>`.

| Phase | Agent | Model | Can edit | Mechanically blocked from |
| --- | --- | --- | --- | --- |
| 0 — Contract | `agents/type-author.md` | gpt-5.4 (reasoning: high) | dedicated contract files (`*.d.ts`, `types.ts`, `types/`, `contracts.py`, `types.py`, `*.pyi`) | test files |
| 1 — RED | `agents/test-author.md` | gpt-5.4 | test files only | implementation files and `tasks.md` |
| 2 — GREEN | `agents/implementer.md` | gpt-5.3-codex (reasoning: low) | implementation/config/docs, but not contract or test files | test files and contract files |
| Orchestration | `agents/tdd-orchestrator.md` | gpt-5.6-terra | `progress.md` + `intent.md` only | all code; can only task the three agents above |

Model philosophy: intelligence is front-loaded into the artifacts. The contract and tests carry the deep thinking (strong model, high reasoning), so implementation becomes constraint-satisfaction — pinned by the compiler, the failing test, and checksums — and runs on a cheaper coding specialist. If the implementer starts burning self-correction retries, bump its model back up.

How enforcement works:

- **Permission globs** — each agent's `edit` permission scopes its lane; violations are blocked by opencode, not by prompt discipline.
- **Scoped reads and shell** — the test-author only gets spec/contract/test reads, and the pipeline agents can only run narrow verification commands.
- **Checksum verification** — the orchestrator hashes contract files after Phase 0 and test files after Phase 1, and rejects Phase 2 work if either changed.
- **Independent verification** — the orchestrator re-runs typecheck and tests itself between phases; agent reports are claims, not evidence.
- **Self-correction loop** — up to 3 retries per phase with failure evidence, then hard stop and escalate to the human.
- **Disagreement protocol** — an agent that disputes a test or type escalates to the orchestrator, which routes the fix to the owning agent.

Task classification: behavioral code gets the full pipeline; type/schema-only tasks go to `type-author` alone (the compiler verifies); config/docs/trivial changes go straight to `implementer` in direct-task mode with explicit acceptance criteria and verification commands.

Language support: the orchestrator detects the type checker at intake — TypeScript (`tsc --noEmit`), Python (`mypy`/`pyright`), JS with `checkJs` (`tsc --checkJs`) — and passes the verifier command in handoffs. Contracts are declarations only in dedicated files (no stubs), so the implementer never edits them. **Projects with no viable type checker (plain JS) skip Phase 0** and switch to explicit `no-contract mode`, recorded in `progress.md` with the public API source of truth used for RED/GREEN.

Context artifacts: `progress.md` (running conventions and decisions, read on every handoff) and `intent.md` (implementation decisions, full for TDD tasks, lite for simple ones).

## MCP servers

- **`mdn`** (remote) — MDN Web Docs reference, browser compatibility data. `https://mcp.mdn.mozilla.net/`
- **`llm-core`** (local) — lints files with `eslint-plugin-llm-core` rules. `npx -y eslint-plugin-llm-core-mcp`
- **`agentmemory`** (local) — long-term session memory for `recall`/`remember` commands. `npx -y @agentmemory/mcp` (server: `http://localhost:3111`)

## Commands

- `commands/apply.md` — implement a change via the type-driven TDD pipeline (`/apply`, runs `tdd-orchestrator`)
- `commands/code-review.md` — run a code review workflow against current changes
- `commands/recall.md` — search past session memory
- `commands/remember.md` — explicitly save a memory
- `commands/verify.md` — verify completed work against rubric and source of truth. Saved artifacts live under the `.agents/docs/verification/` directory

## Verification & Rubrics

- **Verification Guidance** — Shared guidelines, evaluation rubric, and proof of work expectations are defined in [.agents/docs/verification/README.md](.agents/docs/verification/README.md).
- **Artifacts Location** — Full reports and evidence logs are saved under `.agents/docs/verification/` as `verification-<timestamp>-<source-slug>.md`.


## Resources

- [difit](https://github.com/yoshiko-pg/difit) — local diff viewer for code review
- [Diffity](https://github.com/kamranahmedse/diffity) — local diff viewer and agent review workflow
- [hunk](https://hunk.dev) — review-first diff viewer for agent-authored changes
- [GitHub CLI (`gh`)](https://cli.github.com/) — GitHub operations from the terminal
- [gh-dash](https://github.com/dlvhdr/gh-dash) — terminal dashboard for GitHub pull requests and issues
- [RTK](https://github.com/rtk-ai/rtk) — token-saving command proxy for terminal workflows
- [GitNexus](https://github.com/paretoxyz/gitnexus) — code knowledge graph and repo intelligence tools
- [Code Review Graph](https://code-review-graph.com) — local-first knowledge graph tooling used by `crg-plugin.ts`
- [agentmemory](https://github.com/agentmemoryai/agentmemory) — long-term memory MCP server for agent sessions
- [lazygit](https://github.com/jesseduffield/lazygit) - simple terminal UI for git commands
- [lazydocker](https://github.com/jesseduffield/lazydocker) - The lazier way to manage everything docker
- [Matt Pocock Skills](https://github.com/mattpocock/skills) - Skills for Real Engineers.

## Replicating this setup

1. `opencode auth login` / `/connect` → OpenAI and paste an API key (or set `OPENAI_API_KEY`)
2. `rtk init -g --opencode` to install the RTK plugin
3. `code-review-graph install --platform opencode` to install the graph plugin
4. herdr install for agent-state reporting
5. `npx skills add mattpocock/skills` and `npx skills update` for the skill library
6. Point `plugins/agentmemory-capture.ts` at an agentmemory server (default `http://localhost:3111`)
