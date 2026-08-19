# My Opencode Config

Global configuration for [opencode](https://opencode.ai).

## What's configured

- **Models** — OpenAI `gpt-5.4` (default large), `gpt-5.6-luna` (small/titles). Build runs `gpt-5.4`, Plan runs `gpt-5.6-terra`.
- **Default agent** — `lean`, a reduced-context build agent for routine local work. Use `build` for the full toolset and `plan` when you explicitly want planning behavior.
- **Agent style guide** — `docs/agents/style-guide.md` is loaded globally for agent responses, implementation notes, plans, code reviews, code comments, and user-facing documentation. It summarizes [Google's developer documentation style guide](https://developers.google.com/style) with repository-specific precedence rules.
- **Permissions** — developer-friendly defaults. Reads, edits, tasks, and normal shell commands are allowed; destructive operations (`rm`, `rmdir`, `unlink`, `git clean`, `git reset --hard`, destructive `git restore`/`checkout --`, force-push, remote deletion, tag deletion, `git rebase`) are denied. `.env` reads are denied at the file-tool layer.
- **LSP** — enabled for code intelligence.
- **Compaction** — auto with pruning (12K token reserved buffer).
- **TUI** — `tui.json` (`tokyonight` theme, mouse, attention notifications).

## Graph

- `plugins/crg-plugin.ts` — keeps the [Code Review Graph](https://code-review-graph.com) knowledge graph updated. Installed by `code-review-graph install --platform opencode`.
- `skills/gitnexus-*/` — local GitNexus skills for indexing, exploration, debugging, PR review, impact analysis, and refactoring workflows.
- `skills/graphify/` — local Graphify skill for building and querying repository knowledge graphs.
- [GitNexus](https://github.com/paretoxyz/gitnexus) — code knowledge graph and repo intelligence tools.
- [Code Review Graph](https://code-review-graph.com) — local-first knowledge graph tooling used by `crg-plugin.ts`.
- **Optional repo tool: GitNexus** — repository knowledge graph and impact-analysis tooling for larger or unfamiliar codebases. Most useful when agents need to trace callers, dependency impact, architecture relationships, or PR risk across many files. Best added when a repository is large enough that ordinary grep-and-read workflows stop being efficient.

## Review

- `agents/architecture-boundary-reviewer.md` — narrow, diff-only companion to `architecture-reviewer`; checks changed dependency and public-API edges for boundary violations.
- `agents/architecture-reviewer.md` — broader architectural reviewer for pre-implementation fitness and post-implementation drift.
- `agents/performance-reviewer.md` — reviews diffs for performance risks and optimization opportunities.
- `agents/production-readiness-reviewer.md` — reviews diffs for reliability and production safety risks.
- `agents/test-reviewer.md` — reviews diffs for missing or weak test coverage.
- `commands/code-review.md` — run a code review workflow against current changes.
- [difit](https://github.com/yoshiko-pg/difit) — local diff viewer for code review.
- [Diffity](https://github.com/kamranahmedse/diffity) — local diff viewer and agent review workflow.
- [hunk](https://hunk.dev) — review-first diff viewer for agent-authored changes.

## Memory

- **`agentmemory`** (local) — explicit long-term memory for `recall`/`remember` commands. `npx -y @agentmemory/mcp` (server: `http://localhost:3111`)
- `commands/recall.md` — search past session memory.
- `commands/remember.md` — explicitly save a memory.
- [agentmemory](https://github.com/agentmemoryai/agentmemory) — long-term memory MCP server for agent sessions.

## Reference

- **`mdn`** (remote) — MDN Web Docs reference and browser compatibility data. `https://mcp.mdn.mozilla.net/`

## Verification

- **`llm-core`** (local) — lints files with `eslint-plugin-llm-core` rules. `npx -y eslint-plugin-llm-core-mcp`
- `.github/workflows/ci.yml` — continuously runs `npm run typecheck`, `npm run lint`, and `npm test` on pushes and pull requests.
- `commands/verify.md` — verify completed work against rubric and source of truth. Saved artifacts live under the `.agents/docs/verification/` directory.
- **Verification Guidance** — Shared guidelines, evaluation rubric, and proof of work expectations are defined in [.agents/docs/verification/README.md](.agents/docs/verification/README.md).
- **Artifacts Location** — Full reports and evidence logs are saved under `.agents/docs/verification/` as `verification-<timestamp>-<source-slug>.md`.
- **Optional repo tool: JSCPD** — duplicate-code detection for repositories where copy/paste logic is a real maintenance risk. Most useful as an optional input to `/code-review` and `architecture-reviewer` when a change adds or rewrites production logic across multiple files. Prefer its AI reporter for compact agent-facing output. Configure per repo with `.jscpd.json` when the team wants durable duplication checks.
- **Optional repo tool: Knip** — unused files, exports, and dependencies analysis for JavaScript/TypeScript repositories. Useful when a repo accumulates dead code or stale dependencies, especially after refactors. Configure per repo with `knip.json` or equivalent package config when the team wants repeatable cleanup checks.
- **Optional repo tool: Fallow or similar dead-code analyzers** — worth considering in repositories that already rely on framework-aware dead-code analysis beyond what Knip or compiler tooling can provide. Add these per repo only when the team has a concrete dead-code or unused-module problem and the tool is already validated for that stack.

## Security

- `plugins/secret-scan.ts` — runs `gitleaks dir` on session start and after edits, then warns with redacted findings. If `gitleaks` is not installed, it logs a one-time disabled warning.
- `plugins/safety.ts` — truncates oversized tool output into retained artifacts, redacts common secrets before retention, and aborts repetitive tool loops. It is configured through the `plugin` tuple entry in `opencode.jsonc`, which keeps the top-level OpenCode config schema-valid.
- `.gitleaks.toml` — extends the default `gitleaks` ruleset for repo-level tuning.
- Prefer `.gitleaks.toml` for durable shared policy such as path allowlists or disabled rules.
- Use `.gitleaksignore` only for reviewed, specific finding fingerprints that you intentionally want to suppress.

## Workflow

- `plugins/rtk.ts` — [RTK](https://github.com/rtk-ai/rtk) command rewriting for token savings. Install via `rtk init -g --opencode`. Track savings with `rtk gain`.
- `plugins/herdr-agent-state.js` — herdr agent-state integration. Managed by herdr; reinstalling overwrites it.
- `.agents/skills/` — engineering workflow skills from [mattpocock/skills](https://github.com/mattpocock/skills), managed via `npx skills` and updated with `npx skills update` (sources recorded in `skills-lock.json`).
- `lean` (inline in `opencode.jsonc`) — reduced first-call context by denying heavyweight tools, MCP tools, and skill loading unless you switch to another agent.
- `opencode.jsonc` keeps `build` and `plan` intact, but makes `lean` the default agent to avoid advertising skills, MCP tools, task orchestration, web fetch/search, and LSP on every first call.
- The explicit `~/.claude/RTK.md` instruction entry was removed because `~/.claude/CLAUDE.md` already references it.
- Switch back to the richer agents when needed: `build` for full tool access, `plan` for planning-first workflows.
- `commands/apply.md` — implement a change via the type-driven TDD pipeline (`/apply`, runs `tdd-orchestrator`).
- [GitHub CLI (`gh`)](https://cli.github.com/) — GitHub operations from the terminal.
- [gh-dash](https://github.com/dlvhdr/gh-dash) — terminal dashboard for GitHub pull requests and issues.
- [RTK](https://github.com/rtk-ai/rtk) — token-saving command proxy for terminal workflows.
- [lazygit](https://github.com/jesseduffield/lazygit) - simple terminal UI for git commands.
- [lazydocker](https://github.com/jesseduffield/lazydocker) - The lazier way to manage everything docker.
- [Matt Pocock Skills](https://github.com/mattpocock/skills) - Skills for Real Engineers.

### Type-Driven TDD Pipeline

Separated-agent implementation flow (types → RED → GREEN), modeled on the cg-agent-flow openspec pipeline. Separation defeats confirmation bias: the agent that writes tests never sees the implementation plan, and the agent that writes code can't touch the tests or the type contract.

Run it with `/apply <change or task description>`.

| Phase | Agent | Model | Can edit | Mechanically blocked from |
| --- | --- | --- | --- | --- |
| 0 — Contract | `agents/type-author.md` | gpt-5.4 (reasoning: high) | dedicated contract files (`*.d.ts`, `types.ts`, `types/`, `contracts.py`, `types.py`, `*.pyi`) | test files |
| 1 — RED | `agents/test-author.md` | gpt-5.4 | test files only | implementation files and `tasks.md` |
| 2 — GREEN | `agents/implementer.md` | gpt-5.3-codex (reasoning: low) | implementation/config/docs, but not contract or test files | test files and contract files |
| Orchestration | `agents/tdd-orchestrator.md` | gpt-5.6-terra | `progress.md` + `intent.md` only | all code; can only task the three agents above |

Model philosophy: intelligence is front-loaded into the artifacts. The contract and tests carry the deep thinking (strong model, high reasoning), so implementation becomes constraint-satisfaction, pinned by the compiler, the failing test, and checksums, and runs on a cheaper coding specialist. If the implementer starts burning self-correction retries, bump its model back up.

How enforcement works:

- **Permission globs** — each agent's `edit` permission scopes its lane; violations are blocked by opencode, not by prompt discipline.
- **Scoped reads and shell** — the test-author only gets contract/test file reads plus sanitized spec excerpts in its handoff, and the pipeline agents can only run narrow verification commands.
- **Checksum verification** — the orchestrator hashes contract files after Phase 0 and test files after Phase 1, and rejects Phase 2 work if either changed.
- **Independent verification** — the orchestrator re-runs typecheck and tests itself between phases; agent reports are claims, not evidence.
- **Self-correction loop** — up to 3 retries per phase with failure evidence, then hard stop and escalate to the human.
- **Disagreement protocol** — an agent that disputes a test or type escalates to the orchestrator, which routes the fix to the owning agent.

Task classification: behavioral code gets the full pipeline; type/schema-only tasks go to `type-author` alone (the compiler verifies); config/docs/trivial changes go straight to `implementer` in direct-task mode with explicit acceptance criteria and verification commands.

Language support: the orchestrator detects the type checker at intake: TypeScript (`tsc --noEmit`), Python (`mypy`/`pyright`), JS with `checkJs` (`tsc --checkJs`), and passes the verifier command in handoffs. Contracts are declarations only in dedicated files (no stubs), so the implementer never edits them. **Projects with no viable type checker (plain JS) skip Phase 0** and switch to explicit `no-contract mode`, recorded in `progress.md` with the public API source of truth used for RED/GREEN.

Context artifacts: `progress.md` (running conventions and decisions, read on every handoff) and `intent.md` (implementation decisions, full for TDD tasks, lite for simple ones).

## Replicating this setup

1. `opencode auth login` / `/connect` → OpenAI and paste an API key (or set `OPENAI_API_KEY`)
2. `rtk init -g --opencode` to install the RTK plugin
3. `code-review-graph install --platform opencode` to install the graph plugin
4. herdr install for agent-state reporting
5. `brew install gitleaks` to enable secret scanning
6. `npx skills add mattpocock/skills` and `npx skills update` for the skill library
7. Start or configure an agentmemory MCP server (default local command: `npx -y @agentmemory/mcp`)
