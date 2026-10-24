# Architecture review

Reviewed on October 24, 2026, and updated the same day after four rounds of
follow-up fixes: stale state and route models, shared shell-command handling,
code review fixes to commit detection, and the code-graph setup. Each finding has
a **Status** line; the original finding text follows it unchanged. Findings added
during follow-ups are marked "added". Runtime findings H1–H6 are tracked
separately in `harness-review-findings.md`.

## Assessment

The architecture is coherent, but it has accumulated policy duplication,
unfinished cleanup, and tooling complexity disproportionate to its small runtime.
Incremental improvements are preferable to a redesign.

The strongest parts are the separation between lifecycle orchestration and
delivery, scoped agent responsibilities, small integration plugins, and
substantial regression coverage.

## Status summary

| Finding | Severity | Status |
| --- | --- | --- |
| Safety plugin owns too many responsibilities | High | Partly addressed |
| Shared runtime code sits outside meaningful typechecking | High | Partly addressed |
| Loop detection ignored OpenCode V2 tool IDs (added) | High | Fixed |
| Agent routing cannot distinguish its intended task classes | Medium | Open; route models realigned |
| Plugins implicitly depend on command representation | Medium | Fixed for plugins; permission rules open |
| Workflow policy has several maintenance surfaces | Medium | Partly addressed |
| Graph tooling overlapped and agents could not query it (added) | Medium | Fixed; live agent check pending |
| Explore-agent hook checks use V1 tool names (added) | Medium | Open |
| Secret redaction applies only to oversized output (added) | Medium | Open; intent unconfirmed |
| Stale implementation remnants remain | Low | Fixed in `9b28e1b` |
| A retention failure skips loop detection (added) | Low | Open |
| The graph plugin's after-edit update overlaps the server watcher (added) | Low | Open |
| Parallel OpenSpec skill copies | Maintenance | Open |

## Findings

### High: The safety plugin owns too many responsibilities

**Status: Partly addressed.** Chained-command splitting and `rtk` prefix
handling moved to `lib/shell-command.ts`, which the safety, graph, and RTK
plugins now share. Output retention, redaction, temp-file pruning, loop
detection, and explore-agent checks remain in `plugins/safety.ts` (730 lines).
Loop-detection state is still module-level rather than owned by each plugin
instance.

`plugins/safety.ts` combines shell inspection, explore-agent permissions,
redaction, output retention, filesystem cleanup, loop detection, and session
tracking in 821 lines. Changes to one control require understanding unrelated
controls.

Extract cohesive modules for command policy, output retention, and loop detection.
Keep plugin setup as a thin adapter, with state owned by each plugin instance.
Preserve existing regression tests during extraction.

### High: Shared runtime code sits outside meaningful typechecking

**Status: Partly addressed.** `tsconfig.json` now includes `lib/**/*.ts` and sets
`allowImportingTsExtensions` with `noEmit`, so new shared modules are
typechecked. `strict` is still off. `plugins/herdr-agent-state.js` and the
`scripts/` modules that plugins import remain unchecked.

`tsconfig.json` disables strict mode and includes only TypeScript plugins. Those
plugins import JavaScript routing and observation modules from `scripts/`, leaving
important cross-module contracts unchecked.

Gradually typecheck runtime JavaScript using JSDoc and `checkJs`, or migrate the
shared modules to TypeScript. Start with routing decisions and hook inputs.
Separate reusable runtime modules from executable CLI entrypoints.

### High: Loop detection ignored OpenCode V2 tool IDs (added in follow-up)

**Status: Fixed.** `TRACKED_TOOL_NAMES` now includes both V1 and V2 IDs, and
`tests/safety.test.js` checks that repeated `shell`, `patch`, and `subagent`
calls trigger loop detection.

The safety plugin tracked only V1 tool IDs (`bash`, `apply_patch`, `task`). The
OpenCode V2 documentation names these tools `shell`, `patch`, and `subagent`, and
`scripts/tool-observation.mjs` uses the same IDs. Repeated shell, patch, and
subagent calls were therefore not checked for loops. This conclusion comes from
documentation and repository code, not a live OpenCode session.

### Medium: Agent routing cannot distinguish its intended task classes

**Status: Open; route models realigned.** Commit `66d65c3` changed the `lean`
and `build` agent models without updating `scripts/route-agent.mjs`, so enabled
routing would have switched sessions back to the old models. Commit `9b28e1b`
realigned the routes, and `tests/route-agent.test.mjs` now fails when a route's
model differs from its agent's model in `opencode.jsonc`.

The classification limitation remains. Every input the provider receives is
available locally, so any rule the remote classifier applies could also be
written as a local rule. This is an inference from the payload shape. Promptfoo
evaluations against a deterministic baseline are the appropriate way to test
whether the remote classifier earns its latency and dependency.

`scripts/route-agent.mjs` sends prompt-length buckets, attachment counts, and
approved identifiers while asking the provider to distinguish architecture,
implementation, and routine edits. Different intents can produce identical
payloads. This is documented, but remains an architectural limitation. Routing
is disabled by default, which limits current exposure.

Keep the privacy boundary. Prefer explicit routing or a locally derived task
category. Retain remote classification only if evaluations demonstrate useful
improvement over a deterministic baseline.

### Medium: Plugins implicitly depend on command representation

**Status: Fixed for plugins; permission rules open.** The graph plugin now
inspects only shell tools, splits chained commands, ignores an `rtk` prefix, and
ignores shell comments. It no longer treats file `content` as a command.
`code-review-graph` runs in the session directory, so the plugin skips a commit
that follows `cd`, `pushd`, or `popd` because that commit's repository is
unknown. The safety plugin still inspects comment text, so its checks fail
closed. `tests/shell-plugin-order.test.mjs` runs the real RTK and graph hooks in
both orders against fake CLIs.

Shell permission rules in `opencode.jsonc` and `agents/explore.md` still list most
patterns twice, with and without `rtk`. Whether a plugin can normalize the `rtk`
prefix before permission matching has not been investigated.

`plugins/crg-plugin.ts` recognizes only commands beginning with `git commit`;
`plugins/rtk.ts` rewrites shell commands. An already-prefixed `rtk git commit`
misses graph analysis, and hook ordering can also matter. The graph hook inspects
command-like content without first restricting the tool.

Define a shared shell-command normalization boundary and test the plugins
together with original and rewritten commands. Restrict commit detection to
shell tools.

### Medium: Workflow policy has several maintenance surfaces

**Status: Partly addressed.** Four consistency tests now cover machine-readable
policy mappings:

- `tests/route-agent.test.mjs` fails when a route's model differs from its
  agent's model in `opencode.jsonc`.
- `tests/orchestration-config.test.mjs`, from the H1 follow-up, validates the
  delegation depth and the TDD orchestrator's front matter against the installed
  V2 schemas. It checks both delegation edges and worker modes, keeps the
  three-worker allowlist, and denies an unapproved worker.
- `tests/lean-mcp-permissions.test.mjs`, from the H2 follow-up, checks that
  `lean`'s MCP denies use registered names with hyphens preserved, and that the
  dormant memory restrictions stay explicit.
- `tests/opencode-mcp.test.mjs` validates both graph servers against the
  installed V2 MCP schema and checks which agents can see the explore graph
  server.

The README model summary was also corrected. Model assignments in agent front
matter, command files, and README tables remain hand-maintained, with no check
tying them together. A consistency test is likely cheaper than generating these
tables.

Model assignments, review criteria, lifecycle gates, and permissions appear
across agents, commands, configuration, scripts, and the README.
`docs/ARCHITECTURE.md` describes workflow authority well, but does not map runtime
dependencies or policy ownership.

Give each policy one authoritative source. Generate repetitive tables where
practical, and add consistency checks for agent names, route/model mappings, and
permission profiles. Extend the architecture document with a compact runtime
dependency map.

### Medium: Graph tooling overlapped and agents could not query it (added in follow-up)

**Status: Fixed; live agent check pending.** One code graph setup replaces the
three tools:

- `opencode.jsonc` configures a single `code-review-graph` MCP server. OpenCode
  starts local MCP servers in each session's workspace, so this one entry serves
  every repository. A `sh -c` wrapper starts it with `--auto-watch` only when the
  workspace is inside a git repository; home, temporary, and other
  non-repository workspaces get no watcher.
- `code-review-graph-explore`, a second server with Code Mode off and no
  watcher, gives the `explore` agent read-only access. `explore` denies
  `execute`, so it cannot reach Code Mode tools. Allowing `execute` was rejected
  because Code Mode's runtime also provides `fetch` for outbound HTTP requests.
  A global `code-review-graph-explore_*` deny hides this server
  from every other agent, and `agents/explore.md` re-allows seven read-only tools.
  Build, embedding, refactor, and main-server tools stay denied. Turning Code
  Mode off on the main server instead would have added about 7,300 tokens of tool
  definitions to every agent. The second server costs one idle process of about
  50–100 MB per workspace.
- `AGENTS.md` → **Code graph** tells agents to use the graph only inside a git
  repository, to call `list_graph_stats_tool` first, and to run a full rebuild when
  the graph is empty or `_graph.head_matches_build` is false. Agents without the
  build tool, and sessions where the server is unavailable, fall back to text
  search.
- The disabled GitNexus MCP entry, the seven `skills/gitnexus-*` skills, and
  `skills/graphify` were removed. GitNexus still runs in Claude Code through its
  hooks, so the `.gitnexus` ignore entries stay.
- `tests/opencode-mcp.test.mjs` and the extended
  `tests/explore-agent-front-matter-policy-red.test.js` cover the servers, the
  git-only watcher, and explore's allowed and denied tools.

No OpenCode agent session has yet called the graph tools through the merged
permissions; that check is tracked as H6 in `harness-review-findings.md`.

Three graph tools overlapped: the code-review-graph plugin, a disabled GitNexus
MCP server with seven skills, and a Graphify skill whose executable was not
installed. The plugin kept a code-review-graph database updated, but no agent
could query it: no MCP server or skill exposed it, and its pre-commit analysis
went to `console.log`, which reaches logs rather than the model. The database had
only ever been grown by incremental updates and covered 18 files; a full build
covers 76. GitNexus's PolyForm Noncommercial 1.0.0 license also rules it out for
work repositories.

Use one graph tool, expose it to agents through MCP, and tell agents when to build
and query it.

### Medium: Explore-agent hook checks use V1 tool names (added in follow-up)

**Status: Open.**

In `plugins/safety.ts`, the explore-agent `execute.before` hook blocks the `edit`
and `task` tools by name, and the permission hook denies the `edit` and `task`
actions. In V2, `write` and `patch` are separate tools under the `edit` action,
and the `task` action is now `subagent`. `agents/explore.md` denies everything it
does not allowlist, so this weakens a second layer of enforcement; no bypass has
been observed.

Use V2 tool and action IDs, ideally through shared tool-identity helpers in
`lib/`.

### Medium: Secret redaction applies only to oversized output (added in follow-up)

**Status: Open; intent unconfirmed.**

`plugins/safety.ts` redacts tokens, keys, and private-key blocks only when output
exceeds `truncation.maxLength`. The truncated head and tail returned to the model
are redacted, but shorter output reaches the model unchanged. If redaction is
meant only to keep secrets out of retained files, document that; otherwise apply
it to all output.

### Low: Stale implementation remnants remain

**Status: Fixed in `9b28e1b`.** `sessionAgents`, the `doomLoop.exemptTools`
option, the test that implied it worked, and `tests/sample.test.js` were removed.

In `plugins/safety.ts`, `sessionAgents` is populated and deleted but never read.
`doomLoop.exemptTools` is accepted as configuration but never consulted by loop
detection. `tests/sample.test.js` asserts only `1 === 1`.

Remove the unused session bookkeeping and placeholder test. Either implement
`exemptTools` or remove that misleading configuration surface.

### Low: A retention failure skips loop detection (added in follow-up)

**Status: Open.**

In the safety plugin's `execute.after` hook, a failure while saving oversized
output returns from the `catch` block before loop detection runs for that call.
Separating output retention from loop detection would remove this coupling.

### Low: The graph plugin's after-edit update overlaps the server watcher (added in follow-up)

**Status: Open.**

`plugins/crg-plugin.ts` runs `code-review-graph update --skip-flows` after each
completed `edit`, `write`, or `patch`. Inside a git repository, the MCP server's
`--auto-watch` already updates the same graph when files change, so the plugin
repeats that work. Both write to one SQLite database in WAL mode. If the two
updates collide, the plugin's update fails silently, because the plugin ignores
CLI errors. The plugin's pre-commit analysis also reaches only the logs, while
agents can call `detect_changes_tool` through the MCP server.

Remove the plugin's after-edit update. Remove the whole plugin if nobody reads its
pre-commit log, along with `tests/crg-plugin.test.js`,
`tests/shell-plugin-order.test.mjs`, and `withoutComments` in
`lib/shell-command.ts`, which only the plugin uses.

### Maintenance opportunity: Parallel OpenSpec skill copies

**Status: Open.** The `.agents/skills/.openspec-target` marker suggests the
OpenSpec CLI generates both copies. If so, regenerating them with the CLI and not
editing them by hand would address drift without a local generator. This has not
been confirmed.

OpenSpec skill content is duplicated under `.agents/skills/` and
`.opencode/skills/`. The differences checked were command-name adaptations, so
duplication alone is not a defect. Maintaining full parallel copies nevertheless
invites drift.

Use a canonical source with generated platform variants to make ownership clearer.

## Resolved question: chained commands in the explore agent

The explore agent allowlists glob patterns such as `ls *`, while the safety
plugin's chained-command checks use a deny list. This looked like it might allow
`ls; <other command>`. The OpenCode V2 permissions documentation states that the
`shell` resource is produced by a command scanner and that compound commands may
produce several resources, so each part is checked against the allowlist. This
has not been verified in a live session.

## Recommended sequence

Completed:

- Stale state, ineffective configuration, and the placeholder test were removed.
- Route models were realigned with a consistency test.
- Shell-command normalization was shared, and the RTK/graph integration is
  tested.
- Loop detection tracks V2 tool IDs.
- Commit detection skips commits after a directory change and ignores shell
  comments.
- Graph tooling was consolidated on one code-review-graph setup, with read-only
  access for `explore` and a watcher limited to git repositories.

Remaining:

1. Extract output retention (with redaction) and loop detection from
   `plugins/safety.ts` into `lib/` modules without changing behavior. Fix the
   retention/loop-detection coupling, decide redaction scope, and move state into
   plugin setup at the same time.
2. Update the explore-agent hook checks to V2 tool and action IDs.
3. Check the graph setup in a live OpenCode session (H6 in
   `harness-review-findings.md`). Confirm that `explore` sees and can call only
   its seven tools, that other agents cannot see `code-review-graph-explore`, and
   that a first question in a git repository builds the graph once while a
   non-repository workspace builds none.
4. Remove the graph plugin's after-edit update, or the whole plugin if its
   pre-commit log is unused.
5. Investigate normalizing the `rtk` prefix before permission matching, or
   document why both forms of each rule must stay.
6. Turn on `strict` for `plugins/` and `lib/`, then typecheck the `scripts/`
   modules that plugins import.
7. Replace or remove the remote routing classifier, using promptfoo evaluations
   against a deterministic baseline if it stays.
8. Confirm whether the OpenSpec CLI generates both skill copies.

Keep `agents/`, `commands/`, `plugins/`, and `skills/` as recognizable top-level
concepts. Their separation is useful; the main opportunity is improving ownership
and contracts within that structure. `lib/` holds shared runtime modules that are
not plugins. OpenCode loads every direct `.ts` and `.js` file in `plugins/` as a
plugin, so shared helpers must live outside that directory.

## Verification and limits

- Latest follow-up: `npm run ubs` passed every stage under Node.js 22.22.0 and
  npm 10.9.4, with 313 of 313 tests passing. Under the shell's default Node.js
  26.4.0 and npm 12.1.0, UBS stops at the toolchain check by design.
- CodeScene, compared with commit `9b28e1b`: `cs review` found no decline across
  the 12 changed code files. `plugins/safety.ts` improved from 4.27 to 4.68 (4.26
  before any follow-up), and every new file scores 10.0. `cs delta
  --error-on-warnings` exited 0; its only findings, all in `plugins/safety.ts`,
  were improved or unchanged.
- Live runtime: the H1 and H2 follow-ups verified nested delegation and MCP
  permission names in the running OpenCode service (see
  `harness-review-findings.md`). After a configuration reload, the running
  service started the main graph server with `--auto-watch` only in a git
  workspace, plus one explore graph server per workspace.
- Not verified live: the V2 tool IDs that loop detection relies on (`shell`,
  `patch`, `subagent`), which come from the OpenCode V2 documentation and
  repository code, and agent access to the graph tools.
- Original review: typechecking passed. The test run reported 296 tests: 279
  passed and 17 failed because the review sandbox denied localhost server binding
  (`listen EPERM`). Those failures did not establish application regressions. The
  original review made no implementation changes.
