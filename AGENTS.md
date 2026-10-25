# Agent instructions

This configuration is based off of OpenCode v2. Refer to the [OpenCode v2 documentation](https://opencode.ai/v2/docs).

@RTK.md

## Agent skills

### Frontend A11Y

For frontend work, load and follow the `frontend-a11y` skill.

### Issue tracker

Issues and specs are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with default label strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### CodeScene

- For code changes, load and follow the `codescene-mcp` skill for post-edit Code Health reviews, regression handling, and the pre-finish safeguard. If the skill or MCP check is unavailable, report that explicitly rather than claiming it passed.

## Code graph

The `code-review-graph` MCP server builds a local graph of the current git repository and updates it while the session runs. The `explore` agent uses the read-only `code-review-graph-explore` server instead.

- Use the graph only inside a git repository. Never build one for a home directory, temporary folder, or other non-repository workspace.
- Before exploring or changing code in a repository, call `list_graph_stats_tool`. If `files_count` is 0 or `_graph.head_matches_build` is false, call `build_or_update_graph_tool` with `full_rebuild: true`. Incremental updates only compare against `HEAD~1`, so they do not cover a first build, a pull, or a branch switch. If you cannot call the build tool, as with `explore`, report that the graph is missing or stale and continue with text search.
- Use the graph before broad text search for structural questions: `get_minimal_context_tool` to orient, `query_graph_tool` or `traverse_graph_tool` for callers, callees, and imports, `get_impact_radius_tool` before changing shared code, and `detect_changes_tool` or `get_review_context_tool` when reviewing a diff.
- Treat graph results as leads. Confirm them by reading the code before editing or reporting a finding.
- If the server is unavailable, or the repository has no supported source files, say so and use text search instead. Do not describe analysis as graph-based when the graph was not used.

## Working protocol

### Web research

- Use `websearch` for general discovery and `webfetch` to read relevant primary sources. Keep using Context7 for library documentation as instructed.
- If search is unavailable, lacks credentials, or all providers fail, report that the search could not be completed and state the observed reason. Do not present remembered information or a known-URL fetch as search results. Offer to inspect a user-provided URL or ask the user to connect a search provider through `/connect`.

### Changes and verification

- Before editing, inspect the relevant code, tests, project instructions, and current `git status`/diff.
- Treat user requirements, repository documentation, tests, and existing behavior as the source of truth, in that order. Ask a concise question when they conflict or leave a material ambiguity.
- Make the smallest change that fully resolves the request. Do not refactor unrelated code or add compatibility paths without a concrete need.
- Preserve unrelated worktree changes. Never revert, reset, clean, or overwrite work you did not create.
- After editing, run the narrowest relevant formatter, lint, typecheck, and test commands. State explicitly if verification could not run or fails.
- For behavior changes, add or update a focused regression test when the repository has an appropriate test layer.
- Before committing, inspect `git status`, `git diff`, and recent commit messages. Commit only when explicitly requested.
- When a commit is explicitly requested, prefer small atomic commits. For behavior-changing work, commit after REFACTOR and final verification, not after GREEN. Keep each commit scoped to one verified behavior, slice, or other inseparable unit of work.

### Task state

- For three or more meaningful steps or multiple deliverables, maintain a short `todowrite` checklist. A short answer or single mechanical edit needs no checklist. If the tool is unavailable, use a Markdown checklist.
- Before substantial work spanning files or stages, a handoff, or a pause with unfinished work, create or resume a durable work item using the `work-intake` skill. Reuse an existing work item or workflow `progress.md`/`intent.md` rather than creating a second record. For read-only tasks or restricted agents, respect edit permissions and return the checkpoint to the owning session instead.
- Keep current execution state in `progress.md`: acceptance criteria, completed and remaining steps, verification commands and outcomes, blockers, and one concrete next action. Update after a meaningful step or check, when blocked, and before handoff, manual compaction, or ending with unfinished work. Mirror that state in the session checklist; a todo completion alone is not verification evidence.
- On resume or after compaction, read the active checkpoint before acting and reconstruct the checklist from it. `work-item.mjs resume` returns intake metadata only; also read the work item's `progress.md`. If the active ID is unknown, use `list` and ask when multiple records could match. Never infer completion from an intake status or a summary alone.
- Follow `docs/agents/work-items.md` in the `workflow` reference for checkpoint format and ownership. Update checkpoints regularly because automatic compaction can occur before an explicit handoff.

## Documentation

- Read repository-local `AGENTS.md`, `README`, and relevant docs before making decisions; nearer instructions override broader ones.
- Update documentation only when a user-visible workflow, configuration surface, or durable architectural decision changes.
- Use existing project terminology and conventions rather than introducing new names for established concepts.

## Architecture and integration

### Architecture reviews

- Treat a review request as read-only unless the user also authorizes changes. Saving a requested review report does not authorize implementation fixes.
- For each finding, identify the affected file and symbol or line, explain the concrete failure or maintenance cost, and propose a scoped improvement. Distinguish confirmed defects, design tradeoffs, and unverified hypotheses; do not present file size or duplication alone as a defect.
- Prioritize findings by impact and state the review scope, checks run, and limitations. Recheck referenced code before carrying an earlier finding into a new review.

### Policy ownership and consistency

- Before changing models, routing, permissions, or workflow gates, identify the authoritative source by file and inspect its consumers in configuration, scripts, agents, commands, tests, and documentation.
- If ownership is undocumented, state which source the change treats as authoritative and why. Resolve conflicting definitions before claiming the change is complete.
- When a policy changes, update affected consumers or verify they remain consistent. Add or update a focused consistency check for machine-readable mappings when an appropriate test layer exists; otherwise report the exact manual comparison performed.

### Plugin and shared runtime changes

- When changing command rewriting, command detection, or tool-event hooks, inspect other plugins that consume or mutate the same fields. Add or update an integration regression test for affected interactions, including original and rewritten commands when applicable. Test relevant hook orders unless ordering is guaranteed by a verified contract.
- Keep reusable runtime logic separate from CLI startup and argument handling when adding or extracting modules. Do not move unrelated code solely to satisfy this rule.
- For changed JavaScript modules imported by plugins, run focused tests of those modules and their plugin boundary. Report whether typechecking includes those modules; a passing plugin-only TypeScript check is not evidence that imported JavaScript contracts were checked.

### Generated and vendored content

- Before editing generated, vendored, or duplicated skills, identify the canonical source and generation or update mechanism. Preserve intentional platform differences.
- Prefer changing the canonical source and regenerating derived files. If no mechanism exists, document which copies were changed and compare them for unintended drift; do not claim synchronization without that comparison.

### Verification evidence

- Report the commands run, their outcomes, and any checks skipped or blocked. For failed checks, distinguish confirmed application failures from environment restrictions and unresolved causes using the observed error as evidence.
- Never describe verification as fully passing when a required check failed, was skipped, or was blocked. State what remains unverified; do not infer that an environment-blocked test would pass elsewhere.
- Before finishing edits, inspect the final diff and status. Confirm that changes are limited to the authorized scope and preserve pre-existing worktree changes.

## Configuration changes

- For changes to OpenCode configuration, agents, plugins, skills, or MCP setup, validate configuration shape first.
- OpenCode must be restarted after configuration-time files change.
