# Harness review findings

Reviewed: 2026-10-24

Progress updated: 2026-10-24

## Summary

The harness has the core tools for code inspection, editing, command execution,
documentation lookup, browser verification, quality checks, delegation, and
long-running work. The main opportunities are configuration consistency, durable
task tracking, and verification of the complete runtime.

The initial review was read-only. The 2026-10-24 follow-ups implemented H1 and H2,
verified nested delegation, and checked MCP permissions and access in the live runtime.
A later follow-up remediated H6 by replacing the graph skills with one
code-review-graph setup; its live agent check is still pending.
Check off work below only after recording verification evidence; configuration
changes alone do not establish that a workflow works.

### Progress at a glance

- **Complete — H1:** TDD supports both entrypoints, nesting depth is two, and
  real SDLC → TDD → implementer delegation and returned results were verified.
- **Complete — H2:** Four MCP permission names were corrected. Regression tests,
  24 live permission outcomes, and real lean/build/plan tool calls were checked.
- **Partial — H5:** H1/H2 provide manual runtime evidence for delegation and tool
  access. A repeatable runtime suite and the remaining scenarios are outstanding.
- **Remediated, verification pending — H6:** The graph-skill replacement,
  repository-only watcher, and read-only explore configuration are implemented.
  The remaining live agent checks are listed in H6.
- **Open — H3/H4:** General web-search access and ordinary-session task tracking
  have not been implemented as part of these findings.
- **Verification scope:** H1/H2 recorded blocked CodeScene MCP checks because
  `CS_ACCESS_TOKEN` was unavailable to that service. H6 separately records a
  later CLI `cs delta` result; these are distinct checks, not a blanket pass.

## Tracking

| ID | Finding | Priority | Status |
| --- | --- | --- | --- |
| H1 | Nested orchestration configuration mismatch | High | Complete; runtime verified |
| H2 | Tool permission names differ from registered names | High | Complete; runtime verified |
| H3 | Default agent lacks general web search | Medium | Open |
| H4 | Ordinary sessions lack consistent task-state tracking | Medium | Open |
| H5 | Evaluations exclude the complete OpenCode runtime | Medium | Partial; manual H1/H2 runtime checks complete |
| H6 | Graph skills prescribe unavailable capabilities | Low | Remediated; live agent check pending |

For each item, update its status and completion evidence together. A deliberate
decision to retain a tradeoff can close an item if the rationale is recorded.

## H1 — Nested orchestration configuration mismatch

**Initial finding:** `agents/sdlc-orchestrator.md` delegates behavioral implementation to
`tdd-orchestrator`, but `agents/tdd-orchestrator.md` declared `mode: primary`.
The TDD orchestrator was absent from this session's callable subagent list.

`opencode.jsonc` also left `experimental.subagent_depth` unset. The documented
V2 default is one level, which does not support a child TDD orchestrator launching
its own worker agents.

**Initial impact:** The documented SDLC → TDD → worker delegation chain was
inconsistent with the configured agent mode and default nesting limit. The
initial review did not execute the complete chain.

**Recommendation:** Make the TDD orchestrator callable as both a primary agent
and a subagent, and configure nesting for the intended chain.

- [x] Confirm the intended entrypoints and required delegation depth.
- [x] Set the TDD orchestrator to `mode: all` if both entrypoints are retained.
- [x] Set `experimental.subagent_depth` for SDLC → TDD → worker delegation.
- [x] Verify actual nested launches and worker results in an isolated fixture.
- [x] Update affected workflow documentation and consistency checks.

**Configuration and verification evidence (2026-10-24):**

- Treat `opencode.jsonc` as the nesting-policy source and the Markdown agent
  front matter as the source for entrypoint mode and worker permissions.
- Set `agents/tdd-orchestrator.md` to `mode: all` and
  `experimental.subagent_depth` to `2`, retaining `background_compaction` and
  all existing permissions. Direct `/apply` and SDLC delegation remain intended
  entrypoints; SDLC → TDD → worker requires two child levels.
- Updated README workflow guidance, including the required OpenCode restart.
- Before editing, parsed JSONC and validated proposed depth `2` against the
  installed `@opencode/schema` experimental schema. Existing extra fields were
  ignored in that preliminary check; this was not full-runtime validation.
- `rtk proxy node --test tests/orchestration-config.test.mjs tests/opencode-compaction.test.mjs`:
  2 passed. The new test validates depth and TDD front matter against installed
  V2 schemas, checks both delegation edges and worker modes, and preserves the
  three-worker allowlist and denial of an unapproved worker. The depth-only
  schema check intentionally excludes unrelated experimental fields.
- `rtk proxy sh -c 'node_modules/.bin/eslint tests/orchestration-config.test.mjs; node_modules/.bin/tsc --noEmit; node_modules/.bin/markdownlint-cli2 README.md agents/tdd-orchestrator.md'`:
  ESLint, typecheck, and Markdown lint passed. The `.mjs` consistency test is
  executed by Node and linted; it is not covered by the TypeScript check.
- Runtime binary: `opencode v2.1.4`. CLI startup initially failed with `EPERM`
  writing its default log. Redirecting XDG data/state/cache into `/tmp` allowed
  CLI inspection. `opencode debug config` then failed because managed-service
  port 49374 was already in use; `opencode api --standalone GET /config` failed
  with `Standalone server exited before reporting readiness`. Neither attempt
  verifies runtime config loading, nested launches, or worker results. The
  standalone failure's underlying cause remains unresolved.
- Checks ran on Node v26.4.0, outside the supported Node 22.x toolchain.
- CodeScene MCP tools were unavailable in that follow-up session; Code Health
  review and the pre-finish safeguard were not run. These were not passing checks.

**Runtime follow-up (2026-10-24):**

- `npm run verify:toolchain` passed on Node `22.22.0` and npm `10.9.4`.
- `opencode api get /api/info` successfully reached the existing managed service,
  version `2.1.4`. The earlier startup failures did not recur on this route; their
  underlying causes were not diagnosed. No managed-service restart was needed
  for this verification: a fresh fixture location loaded the updated settings.
- Queried `/api/config` and `/api/agent/tdd-orchestrator` with the fixture's
  explicit `location[directory]`. The service loaded `subagent_depth: 2`,
  `background_compaction: true`, TDD `mode: all`, and the existing three-worker
  allowlist from the global configuration. No fixture config, model override,
  permission override, or automatic approval flag was used.
- Re-ran `rtk proxy node --test tests/orchestration-config.test.mjs tests/opencode-compaction.test.mjs`:
  both tests passed on the supported toolchain.
- `npx --no-install eslint tests/orchestration-config.test.mjs`,
  `npm run typecheck`, and
  `npx --no-install markdownlint-cli2 README.md agents/tdd-orchestrator.md harness-review-findings.md`
  passed. The consistency test remains outside the TypeScript check.
- The first live fixture launched SDLC → TDD, but stopped before launching a
  worker because the fixture requested root-level coordination files. Both
  agents reported `permission.rejected: Permission denied: edit`. SDLC permits
  nested work-item paths, and TDD's `**/progress.md` and `**/intent.md` rules do
  not match those root-level paths. This was an invalid fixture layout, not a
  demonstrated nesting failure. The corrected fixture uses
  `case/.agents/work/h1/progress.md` and `case/.agents/work/h1/intent.md` without
  changing permissions. The first root session was
  `ses_e9163769cffea5RXjVJ6FWMvak`; its TDD child was
  `ses_e9162a9f2ffe6oYgY3ZvgZlq3Y`.
- CodeScene's review of `tests/orchestration-config.test.mjs` was blocked by
  missing authentication. Presence-only checks found `CS_ACCESS_TOKEN` absent
  from the shell and empty in the service's resolved MCP configuration;
  CodeScene `get_config(access_token)` reported `source: not set`. An OAuth
  attempt was interrupted. Per the user's correction, use `CS_ACCESS_TOKEN`
  only and do not retry login. No token value was displayed or persisted.
  Code Health and the dependent pre-finish safeguard remain unverified.

**Successful nested-launch evidence (2026-10-24):**

- Fixture directory:
  `/private/var/folders/7x/ywy68wn95m92s2l0kbrsxp5w0000gn/T/opencode/h1-runtime-ARMn1q`.
  Its README defines a docs-only diagnostic: SDLC delegates to TDD, TDD delegates
  to the implementer, and only the implementer initially reads `challenge.txt`
  and writes its exact contents to `receipt.md`. Coordination uses the nested
  work-item paths above. The fixture contains no application code or dependencies.
- Launched a new primary session from that directory with
  `opencode run --agent sdlc-orchestrator --format json --title 'H1 nested delegation corrected fixture' '<fixture diagnostic prompt>'`.
  The prompt explicitly required real SDLC → TDD → implementer calls, configured
  models and permissions, the README's acceptance criteria, independent receipt
  reads, and no changes outside the fixture. CLI events and stderr are retained
  locally as `retry.jsonl` and `retry.stderr` in the temporary fixture.
- The session API confirmed this exact parent-child chain, with all three
  sessions reporting `outcome: succeeded`:

  | Role | Session ID | Observed model |
  | --- | --- | --- |
  | SDLC root | `ses_e91615fd2ffeMK3tNQHrUprU3r` | `openai/gpt-6-sol#xhigh` |
  | TDD child | `ses_e91609f72ffeBBPmA4MZlzUR6j` | `openai/gpt-6-sol#xhigh` |
  | Implementer grandchild | `ses_e916073c6ffeo4sncewlkkNCly` | `openai/gpt-6-luna#medium` |

- Independently queried `/api/session/{id}` and
  `/api/session/{id}/message?limit=100&order=asc` through `opencode api` for all
  three sessions. A Node assertion check verified agent IDs, parent IDs, fixture
  locations, completed subagent calls identifying the actual children, the
  worker's completed challenge read and receipt patch, TDD's independent reads
  after the worker returned, and SDLC's receipt read. Each session's response
  propagated the receipt. This check returned `PASS`; it did not rely solely on
  agent summaries or the session outcome field.
- Independently compared the files with
  `assert.deepEqual(readFileSync('receipt.md'), readFileSync('challenge.txt'))`:
  exact byte equality passed. Receipt content was
  `H1-worker-receipt-ARMn1q-20261024` followed by a newline. SHA-256:
  `6b0e19afa114fa1a9bc2a9ad3cf491364ed6d05846018265d8bab5ffedcb5ab2`.
- The corrected run had two non-blocking SDLC discovery errors: a compound shell
  command was denied, and reading `case` before its creation returned file not
  found. SDLC continued with permitted reads and patches. Neither TDD nor the
  implementer recorded a tool error; both required delegation edges completed.
  No permissions were widened to make the fixture pass.

**Closure:** H1's agent-mode and nesting-depth mismatch is resolved and its
required nested launch/result check passed on the supported toolchain. This
bounded docs-task fixture verifies delegation and returned worker results, not
the complete behavioral TDD pipeline, all worker roles, or every permission
boundary. H5 remains open. Code Health review and its dependent safeguard remain
blocked on `CS_ACCESS_TOKEN` availability; they are not reported as passing.

## H2 — Tool permission names differ from registered names

**Initial finding (investigated 2026-10-24):** The `lean` permissions in
`opencode.jsonc` denied `mdn_get_doc`, while the initial review reported MDN's
registered tool as `get-doc`. The specific V2 MCP Names documentation preserves
letters, numbers, underscores, **and hyphens**. Thus the matching action is
`mdn_get-doc`; `mdn_get_doc` does not match it. Likewise, the registered server
`llm-core` retains its hyphen, so the configured `llm_core_*` actions had the
wrong server prefix. Exact tool suffixes required a fresh runtime catalog.

**Correction to the follow-up assessment:** The conversational review claimed
hyphens normalized to underscores and therefore questioned H2. That claim was
incorrect. The permissions page's generic phrase “unsupported characters” does
not imply hyphens are unsupported; the more specific MCP Names section explicitly
allows them. H2's naming concern is supported by that rule.

The initial review reported a successful MDN call despite the deny. This follow-up
did not reproduce that call or inspect its session's effective configuration.
Treat it as earlier reported evidence, not a newly verified permission bypass.
Catalog visibility alone still does not prove execution is allowed.

**Initial impact:** The reduced-tool profile did not consistently match its
stated intent. Catalog visibility alone is insufficient to verify permission
behavior.

**Recommendation:** Reconcile each intended restriction with registered names
and test effective permissions for each relevant agent.

- [x] Decide which MCP tools `lean` should retain or deny.
- [x] Correct permission actions using actual registered names.
- [x] Check for stale rules referencing unconfigured servers, such as agentmemory.
- [x] Verify both allowed and denied tool behavior for `lean`.
- [x] Verify broader access remains available through the intended agents.
- [x] Add a focused permission-name or runtime consistency check.

**Investigation evidence (2026-10-24):**

- Context7 `resolve-library-id` selected `/websites/opencode_ai_v2`;
  `query-docs` returned V2 mode and MCP normalization guidance. Directly checked
  [MCP Names and Permissions](https://opencode.ai/v2/docs/mcp-servers#names):
  only characters outside letters, numbers, `_`, and `-` are replaced.
- Compared `opencode.jsonc` server IDs with the lean permission actions:
  `mdn_get_doc` versus reported `mdn_get-doc`, and two `llm_core_*` actions
  versus the configured `llm-core` server. These are naming mismatches under
  the documented rule; this is a static comparison, not an enforcement test.
- Seven `agentmemory_*` deny actions exist in lean, but no `agentmemory` server
  is registered in this file. Similar defense-in-depth rules also exist in
  `agents/explore.md` and `plugins/safety.ts`; do not remove them blindly because
  another configuration source could register that server.
- Live allowed/denied checks for lean and broader agents were not run during
  the initial investigation because the runtime startup attempts described in
  H1 failed. Server catalogs, exact tool suffixes, and effective merged
  permissions were unverified at that point; subsequent results are below.
- No H2 permission changes were made during that investigation.

**Remediation and permission verification (2026-10-24):**

- Policy ownership: `opencode.jsonc` is authoritative for `lean`'s permissions;
  README describes the intended reduced-tool profile. Preserve the existing
  intent: deny the four MDN/llm-core tools only for `lean`, retain Context7 and
  Code Mode, and retain broader access through `build` and `plan`.
- Fresh Code Mode catalog discovery returned MDN `get-doc` and `get-compat`,
  plus llm-core `get_active_instructions` and `lint_file`. Changed only the four
  mismatched actions, preserving their `resource: *` and `effect: deny`:

  | Previous action | Corrected action |
  | --- | --- |
  | `mdn_get_doc` | `mdn_get-doc` |
  | `mdn_get_compat` | `mdn_get-compat` |
  | `llm_core_get_active_instructions` | `llm-core_get_active_instructions` |
  | `llm_core_lint_file` | `llm-core_lint_file` |

- Reviewed all seven `agentmemory_*` rules against `agents/explore.md` and
  `plugins/safety.ts`. Retained them as dormant restrictions for another config
  source registering that server. Broader-agent discovery also returned MDN's
  `search` tool: the already-correct `mdn_search` deny had hidden it from lean's
  initial catalog. Retained that active rule and documented both decisions in
  README. Extended the catalog-name contract to cover all five restricted tools.
- Validated the lean agent shape against installed V2 `ConfigAgent.Info` before
  editing. Added `tests/lean-mcp-permissions.test.mjs` with a dated catalog-name
  contract, schema validation, rejection of obsolete underscore aliases, and
  coverage for the retained memory restrictions. Observed RED on the missing
  `mdn_get-doc` deny before changing configuration, then GREEN after the fix.
- `rtk proxy node --test tests/lean-mcp-permissions.test.mjs tests/opencode-mcp.test.mjs tests/orchestration-config.test.mjs tests/opencode-compaction.test.mjs`:
  seven tests passed. ESLint for the new test and `npm run typecheck` passed.
  The `.mjs` test is executed by Node and linted, not covered by TypeScript.
  After adding the already-correct `mdn_search` rule to the contract, re-ran
  `rtk proxy node --test tests/lean-mcp-permissions.test.mjs` (two passed) and
  `npx --no-install eslint tests/lean-mcp-permissions.test.mjs` (passed).
- Created isolated sessions in
  `/private/var/folders/7x/ywy68wn95m92s2l0kbrsxp5w0000gn/T/opencode/h2-runtime-v39FH3`
  with no permission overrides. Queried the live evaluator using
  `POST /api/session/{id}/permission` with the session's agent, each action, and
  `resources: ["*"]`. Asserted all 21 outcomes across `lean`, `build`, and `plan`:
  the four corrected actions are denied only in `lean`; those actions plus
  `execute`, `context7_resolve-library-id`, and `context7_query-docs` are allowed
  for both broader agents. Context7 and execute remain allowed in `lean`.
  Three additional assertions confirmed `mdn_search` is denied for lean and
  allowed for build/plan: 24 permission outcomes passed in total. No saved
  approvals were requested or installed.
- Post-edit catalog searches in the current lean session returned no MDN or
  llm-core tools and both Context7 tools. This complements the explicit live
  deny results; absent tools were not invoked through an alternate route.
- The pre-change API baseline returned `allow` for `mdn_get-compat` and both
  llm-core actions, but already returned `deny` for `mdn_get-doc`. That individual
  baseline result was not explained; this follow-up does not claim to reproduce
  the initial review's successful MDN get-doc call. Post-change assertions above
  cover every corrected action.
- CodeScene reports its token source as `not set`. Code Health review and the
  pre-finish safeguard are blocked on `CS_ACCESS_TOKEN` availability. No OAuth
  login was attempted for H2.

**Live tool-call evidence (2026-10-24):**

Executed `opencode run --session <id> --agent <agent> --format json '<read-only smoke-test prompt>'`
in the temporary fixture. No agent/model/permission overrides or automatic
approval flag were used beyond selecting the named agent. The prompts prohibited
edits, shell commands, delegation, graph generation, and alternate routes to
hidden tools. CLI JSONL evidence remains in the temporary fixture.

| Agent | Session ID | Observed result |
| --- | --- | --- |
| `lean` | `ses_e915b0e44ffeTZliB3FDE4JFoP` | MDN and llm-core catalogs absent; real Context7 resolution returned OpenCode library results |
| `build` | `ses_e915b0cf4ffeTEMcGP451eUMd5` | All five restricted tools discoverable; real MDN and llm-core calls returned substantive results |
| `plan` | `ses_e915b0badffeFFnt6wreCl2aXK` | All five restricted tools discoverable; real MDN and llm-core calls returned substantive results |

- Both broader agents retrieved MDN's `Window: fetch()` documentation, fetched
  compatibility data for the returned `api.fetch` key, and searched MDN for
  `fetch`, obtaining Fetch API results.
- Both broader agents called llm-core `lint_file` on the fixture's `sample.js`.
  It returned a concrete `llm-core/filename-match-export` violation in fallback
  mode: file `sample.js` exports `answer`. This verifies tool execution, not a
  clean lint result for that deliberately minimal fixture. The file was not fixed.
- Initial `get_active_instructions({})` calls failed with
  `Could not find config file.` because the temporary directory has no ESLint
  configuration. Retrying the same tool with the existing repository
  `eslint.config.js` as `configPath` succeeded in both agents, returning 26
  all-file rules and one TypeScript rule. No permission changes were needed.
- Independently inspected CLI tool inputs/results and queried each session's
  identity, agent, location, and outcome through the API. Node assertions checked
  lean catalog exclusion and real Context7 results, broader-agent document,
  compatibility, search, guidance, and lint-diagnostic results, and unchanged
  fixture content. The assertion check returned `PASS`. No claim of tool success
  relies solely on an agent summary or a completed Code Mode wrapper.
- Evidence files: `lean.jsonl`, `build.jsonl`, `plan.jsonl`,
  `build-followup.jsonl`, and `plan-followup.jsonl`, plus their stderr files.
  The follow-up calls resolved the fixture's missing-config error and verified
  the remaining MDN operations.

**Closure:** H2's four permission-name mismatches are fixed. Denial is verified
through the live permission evaluator and catalog exclusion; hidden tools were
not invoked directly. Retained access is verified through real calls in lean,
build, and plan. The dormant memory rules remain deliberate, documented
restrictions. CodeScene review and its dependent safeguard remain blocked on
`CS_ACCESS_TOKEN`, not reported as passing. This is a focused H2 check rather
than the full-runtime regression suite proposed in H5.

## H3 — Default agent lacks general web search

**Finding:** `opencode.jsonc` makes `lean` the default agent and denies its
`websearch` and `webfetch` tools. Context7 provides library documentation, and
Code Mode can fetch known URLs, but this session has no dedicated general web
search tool.

**Impact:** Discovering current issues, release discussions, and unfamiliar
services requires a different agent or another explicitly supported route.
This is a capability tradeoff, not a defect in local coding tools.

**Recommendation:** Allow general search on `lean`, or establish a reliable
handoff to a research-capable agent.

- [ ] Choose direct search access or an explicit research handoff.
- [ ] Configure and document the chosen route.
- [ ] Verify a real search and retrieval of a relevant primary source.
- [ ] Verify the unavailable-provider fallback reports the limitation clearly.

**Completion evidence:** Pending.

## H4 — Ordinary sessions lack consistent task-state tracking

**Finding:** `experimental.todo` is not enabled, and `lean` explicitly denies
`todowrite`. Durable work items and workflow-specific progress artifacts exist,
but `docs/agents/work-items.md` limits the implemented work-item slice to intake
and resume; lifecycle transitions and route-specific execution remain outside it.

**Impact:** Substantial ordinary sessions have no consistently applied structured
record of outstanding work. Background compaction improves context continuity
but does not replace explicit task state.

**Recommendation:** Enable lightweight task tracking and use durable checkpoints
for substantial work, building on existing work-item conventions.

- [ ] Define when a task requires a checklist or durable work item.
- [ ] Enable `experimental.todo` and permit `todowrite` where appropriate, or
  document the chosen equivalent.
- [ ] Define checkpoints for acceptance criteria, completed checks, blockers,
  and the next action.
- [ ] Verify resume from persisted state in a fresh session.
- [ ] Verify unfinished work remains identifiable after compaction.

**Completion evidence:** Pending.

## H5 — Evaluations exclude the complete OpenCode runtime

**Finding:** `evals/ooda/README.md` states that its evaluation loads an agent
Markdown body and uses simulated tools. It does not run OpenCode or load its
skills, permissions, plugins, or orchestration. The document also records that a
real-model baseline had not been run during implementation.

**Impact:** These evaluations cannot establish that the configured harness works
end to end or catch runtime integration mismatches such as H1 and H2.

**Recommendation:** Add a small real-runtime smoke suite alongside the existing
bounded evaluations, with explicit execution requirements and isolated fixtures.

- [ ] Define a repeatable runtime smoke-test entrypoint and fixture repository.
- [x] Manually check expected tool availability, permission decisions, and
  representative allowed calls (H2).
- [x] Manually exercise nested delegation and returned results (H1).
- [ ] Exercise a small edit followed by an observed test result.
- [ ] Exercise background-job completion and failure reporting.
- [ ] Exercise durable checkpoint/resume and compaction continuity.
- [x] Record versions, outcomes, and skipped or blocked checks for the completed
  H1/H2 probes in this report.
- [ ] Integrate those probes and the remaining scenarios into a repeatable suite
  with versioned fixtures and machine-checked results.

**Partial completion evidence (2026-10-24):** H1 records real nested sessions,
independent transcript assertions, and byte-for-byte worker output verification.
H2 records live permission decisions, catalog exclusion, and actual retained
tool access. Both used isolated temporary fixtures and the running OpenCode
service. Their commands, session IDs, results, and limitations are recorded in
the corresponding sections above.

These were manual diagnostic runs, not a committed runtime-test entrypoint.
The H1 receipt edit was followed by a content comparison, not an application
test. Background execution of the diagnostic CLI commands does not establish
the separate agent background-job recovery scenario. H5 remains open until the
repeatable suite and remaining checks are implemented and verified.

## H6 — Graph skills prescribe unavailable capabilities

**Finding:** `skills/gitnexus-exploring/SKILL.md` prescribes GitNexus MCP
resources, while the GitNexus MCP server is disabled. A GitNexus CLI was found
on PATH, but the prescribed MCP workflow is unavailable in this session.

`skills/graphify/SKILL.md` triggers on virtually any codebase question and
includes installation and graph-generation instructions. No Graphify executable
was found on this shell's PATH, and no root `graphify-out/` directory was present.
Other installations were not exhaustively checked.

**Impact:** Broad triggers can load substantial instructions or direct the agent
toward unavailable workflows during ordinary read-only questions.

**Recommendation:** Gate graph workflows on tool/index availability and provide
explicit source-search fallbacks. Keep installation and index generation
separate from routine read-only exploration.

- [x] Identify canonical skill sources and the update mechanism before editing.
- [x] Narrow graph skill triggers to explicit requests or usable existing indexes.
- [x] Define GitNexus CLI or ordinary search fallbacks when MCP is disabled.
- [x] Define a read-only fallback when Graphify or its graph is unavailable.
- [ ] Verify an ordinary codebase question avoids unsolicited installation or
  index generation.
- [ ] Verify explicit graph requests still reach the intended workflow.

The four checked items were met by removing both graph skills and replacing them
with one gated setup, not by editing the skills. The fifth item's index-generation
half is reversed by a recorded decision below.

**Remediation evidence (2026-10-24):**

- Canonical sources: no `skills-lock.json` entry, installer
  (`scripts/install-required-skills.mjs`), or document referenced
  `skills/gitnexus-*` or `skills/graphify`, so no update mechanism would restore
  them. All eight skill directories (17 tracked files) were removed instead of
  narrowing their triggers, along with the disabled `gitnexus` MCP entry in
  `opencode.jsonc`. `git grep -i "gitnexus\|graphify"` now matches only the
  `.gitnexus` ignore entries in `.gitignore` and `eslint.config.js`, kept because
  GitNexus still runs in Claude Code through its hooks.
- Graphify elsewhere: no executable on PATH or in `uv tool list`, no
  `graphify-out/` directories or graphify git hooks under `~/Repos`, and no
  mention in Claude Code settings or rule files.
- Replacement: `code-review-graph` (MIT license, local tree-sitter parsing) is
  configured once in `opencode.jsonc`. OpenCode starts local MCP servers in each
  session's workspace, so the entry serves every repository. Its command runs
  `code-review-graph mcp --auto-watch` only when `git rev-parse
  --is-inside-work-tree` succeeds, and starts without the watcher elsewhere.
- Read-only access for `explore`: `explore` denies `execute`, so it cannot reach
  Code Mode tools. A second server, `code-review-graph-explore` (Code Mode off,
  no watcher), is hidden from every agent by a global
  `code-review-graph-explore_*` deny. `agents/explore.md` re-allows seven
  read-only tools: `list_graph_stats_tool`, `get_minimal_context_tool`,
  `query_graph_tool`, `traverse_graph_tool`, `get_impact_radius_tool`,
  `get_review_context_tool`, and `detect_changes_tool`. Build, embedding,
  refactor, and main-server tools stay denied. Action names keep hyphens, per H2.
  A static scan of those seven tool functions found no build, update, embedding,
  or refactor calls.
- Availability gating and fallback (`AGENTS.md` → **Code graph**): use the graph
  only inside a git repository; call `list_graph_stats_tool` first; build with
  `full_rebuild: true` when `files_count` is 0 or `_graph.head_matches_build` is
  false. An agent that cannot build, such as `explore`, reports a missing or stale
  graph and continues with text search. If the server is unavailable or the
  repository has no supported source files, the agent says so and uses text
  search, and does not describe analysis as graph-based unless the graph was used.
- Decision on first-use builds: this deliberately reverses the recommendation to
  keep index generation out of routine exploration, because the goal is for every
  OpenCode repository to rely on a code graph. The first codebase question in a
  git repository now builds the graph. That build is local and deterministic and
  needs no model or network access. Installation is never automatic: the CLI is a
  manual `uv tool install code-review-graph` step in the README. Home,
  temporary, and other non-repository workspaces are not indexed, and `explore`
  cannot build. Before the git-only watcher, the unconditional watcher created an
  empty `~/.code-review-graph/` cache, which is safe to delete.
- Direct server checks, outside an agent session: in a throwaway git repository
  the server listed 30 tools in about 0.65 s. A build with no arguments on an
  empty graph reported "No changes detected" and left 0 nodes, which is why the
  rule requires `full_rebuild: true`. A full build and stats and impact queries
  then succeeded, and `--auto-watch` added a new file within a few seconds. This
  repository's graph held 18 files from incremental updates only;
  `code-review-graph build` raised it to 76.
- Running service: after the configuration reload at 11:58, `opencode serve` ran
  the main server with `--auto-watch` in this repository and without it in the
  home and temporary workspaces, plus one explore server per workspace.
- Tests and checks: `tests/opencode-mcp.test.mjs` (both servers against the
  installed V2 MCP schema, the git-only watcher with a stand-in CLI, and the
  hidden explore server) and the extended
  `tests/explore-agent-front-matter-policy-red.test.js` (seven allows; build,
  refactor, apply-refactor, embedding, and main-server tools denied) failed before
  the changes and pass after them. `npm run ubs` with Node.js 22.22.0 and npm
  10.9.4 passed every stage with 313 tests. CodeScene `cs delta` reported no
  degraded findings across 12 changed files.
- Not verified: an OpenCode agent session calling graph tools through the merged
  permissions. Still to check: `explore` sees and can call only the seven tools;
  other agents cannot see `code-review-graph-explore`; an ordinary question in a
  git repository triggers one full build; and a non-repository workspace triggers
  none.

**Completion evidence:** Pending the live agent check above.

## Existing coverage and initial review evidence

The reviewed configuration and session provide:

- File search, reading, patching, shell execution, and test commands.
- Context7 and MDN documentation lookup.
- Chrome DevTools browser tooling.
- CodeScene, ESLint integration, and specialist review agents.
- Background shell commands, subagents, worktrees, and automatic compaction.
- Work-item intake/resume plus `progress.md` and `intent.md` conventions.

Checks performed during the review:

- Read `opencode.jsonc`, `AGENTS.md`, `README.md`, relevant agents, skills,
  plugins, work-item documentation, and evaluation documentation.
- Compared configuration with the current session's tool catalog and V2 docs.
- Ran `opencode mcp list`: Chrome DevTools, CodeScene, Context7, llm-core, and
  MDN were connected; Fallow, GitNexus, and SonarQube were disabled.
- Inspected `plugins/sonarqube-mcp.ts`: it disables SonarQube when the current
  project lacks the required project configuration.
- Successfully called Context7 and MDN documentation tools.
- Checked executable discovery: `gh`, `rtk`, `gitnexus`, `node`, `npm`, and
  `opencode` were found; `graphify` was not found on PATH.
- Inspected Git status and diff statistics; pre-existing changes were preserved.

The earlier conversational summary said six active MCP servers; the actual
`opencode mcp list` output showed **five connected MCP servers**. The built-in
`opencode` tool namespace is separate from those servers.

Connection status does not prove every tool operation succeeds. The initial
review did not execute a nested workflow, browser interaction, code-health
analysis, compaction/resume exercise, or full-runtime evaluation. Subsequent H1
delegation checks, H2 permission/access checks, and H6 remediation evidence are
recorded above with their limitations.

## References

- [V2 configuration and experimental settings](https://opencode.ai/v2/docs/config)
- [V2 agents and agent modes](https://opencode.ai/v2/docs/agents)
- [V2 tools](https://opencode.ai/v2/docs/tools)
- [V2 permission matching](https://opencode.ai/v2/docs/permissions)
- [V2 MCP configuration and names](https://opencode.ai/v2/docs/mcp-servers)
