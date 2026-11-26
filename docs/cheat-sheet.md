# Cheat sheet: what to use when

Pick by situation. For how the pieces connect, see the [architecture diagram](ARCHITECTURE.md); for configuration details, see the [README](../README.md).

- **Commands** are what you type, with a leading slash.
- **Primary agents** are what you select: `lean` (default), `build`, `plan`, `sdlc-orchestrator`, and, because they are `mode: all`, `tdd-orchestrator` and `prompt-agent`.
- **Subagents** are launched by commands or orchestrators. You rarely call them directly.
- **Skills** load on their own when their trigger matches, or when a command or agent names them.

`tests/cheat-sheet.test.mjs` fails if a command, agent, skill, or plugin in this repository is missing from this page or the README. Add new ones here with a "use when" line.

## Before building

| Situation | Use | Notes |
| --- | --- | --- |
| Task is fuzzy and you want to know what you are missing | `/blindspot <task>` | Read-only. Ranks unknown unknowns by how much they would change the design. |
| You know the gaps but not the answers | `/interview <task>` | Read-only. One question at a time, highest-impact first. Returns a brief in chat. |
| You cannot tell if a flow or layout is right | `/prototype <idea>` | Mocked UI with fake data under `.agents/prototypes/`. Writes `NOTES.md` when decisions come out of it. |
| Work will outlive this session or spans files or stages | `/intake <request>` | Creates a durable work item under `.agents/work/`. The `work-intake` skill covers the checkpoint rules. |
| You need to read an unfamiliar codebase without changing it | `explore` agent | Read-only subagent for codebase reconnaissance. |
| You are refining an agent prompt, command, or handoff | `prompt-agent` | Does not edit files unless asked. |
| You want to learn by building, not have it built | `socratic-code-mentor` skill | Say "teach me" or "hints only". You write the core; it does the rest. |

A common order for risky work: `/blindspot`, then `/interview`, then `/prototype` if the uncertainty is visual or about flow, then plan. Start implementation in a fresh session seeded with the plan and notes; see [implementation notes](agents/work-items.md#implementation-notes).

## Building

| Situation | Use | Notes |
| --- | --- | --- |
| Routine local work | `lean` | Default agent with a smaller first-call context. |
| Broader tools, or debugging that needs them | `build` | Full toolset. |
| Planning-first or ambiguous work | `plan` | Planning behavior. |
| Behavioral change you want test-first with enforced lanes | `/apply <change or task>` | Runs `tdd-orchestrator`: types, then RED, then GREEN, with checksums and independent verification. |
| A change that goes through proposal, spec, design, tasks, verify, archive | `sdlc-orchestrator` | Owns the OpenSpec lifecycle and delegates to the planning authors and `tdd-orchestrator`. |
| Interface work | `/a11y [scope]`, `frontend-a11y` skill | The skill loads for any frontend task. The command is the explicit build-or-audit workflow. |
| Unfamiliar web API, new UI pattern, or compatibility fallback | `modern-web-guidance` skill | Searches current guides before you choose. |
| Node.js code (APIs, workers, CLIs, scripts) | `nodejs` skill | Not for browser-only edits. |
| Angular project | `angular` skill | Loads when `angular.json` or `@angular/core` is present. |
| After editing code | `codescene-mcp` skill | Post-edit Code Health review and pre-finish safeguard. |
| Standard troubleshooting has failed | `debug-like-expert` skill | In `.agents/skills/`. Evidence gathering and hypothesis testing. |
| Changing this configuration repository | `harness-maintenance` skill | Load it first; `AGENTS.md` points to it. |

## Before merging

Run these in order. Each answers a different question.

| Step | Use | Question it answers |
| --- | --- | --- |
| 1 | `/explain [scope]` | Do I understand what this change does and why? HTML report plus a quiz. Not evidence. |
| 2 | `/verify [source]` | Does the work meet the requirements, with evidence? Saves a report and comments on the linked issue. |
| 3 | `/code-review` | Is the diff sound? Selects specialist reviewers, then opens findings in Difit. |
| 4 | `/pr-agent [action]` | Optional second opinion from a local PR-Agent run. Never publishes comments. |

For OpenSpec changes, `change-verifier` writes `verification.md` as the review surface before archive.

## Codebase health

| Situation | Use | Notes |
| --- | --- | --- |
| Whole-codebase simplification pass | `/audit` | Audit only. Writes one report to `.agents/docs/audits/`. |
| Performance problems anywhere in the project | `/perf-review [focus]` | Read-only scan of existing code, even with a clean working tree. |
| Which files are too complex | `/halstead [changed, branch <ref>, dir <path>, or files <list>]` | Runs the Halstead analyzer and summarizes. Defaults to changed files. |
| Full security audit of a repository | `/security-audit [scope]`, `security-audit` skill | Coverage-led. Artifacts go to `.agents/docs/security-audits/`. |
| End of a session that taught you something | `/learn` | Adds non-obvious learnings to the nearest `AGENTS.md`. |

## Reviewers (subagents)

`/code-review` launches the ones its router selects for the diff. Call one directly only when you want that single lens.

| Agent | Use when the diff... |
| --- | --- |
| `architecture-boundary-reviewer` | changes public APIs, dependencies, packages, or layers. Diff-only. |
| `architecture-reviewer` | needs a broader look at design fitness before building, or drift after. |
| `performance-reviewer` | touches performance-sensitive paths. |
| `production-readiness-reviewer` | touches persistence, external services, auth, async work, deploys, or privacy. |
| `test-reviewer` | changes behavior or tests. |
| `security-audit-reviewer` | affects a security boundary. |
| `frontend-a11y-reviewer` | changes browser-facing interfaces. |

## Pipeline workers (subagents)

Launched by orchestrators. They are listed so you know who did what.

| Agent | Launched by | Role |
| --- | --- | --- |
| `type-author` | `tdd-orchestrator` | Phase 0: contract files only. |
| `test-author` | `tdd-orchestrator` | Phase 1 (RED): one failing test, test files only. |
| `implementer` | `tdd-orchestrator` | Phase 2 (GREEN): production code; cannot edit tests or contracts. Also handles config and docs in direct-task mode. |
| `proposal-author`, `spec-author`, `design-author`, `task-planner` | `sdlc-orchestrator` | Write one OpenSpec artifact each. |
| `spec-syncer` | `sdlc-orchestrator` | Merges delta specs into main specs after gating. |
| `change-verifier` | `sdlc-orchestrator` | Writes `verification.md`. |

## Skills for evals

Pick by stage. Each names the next one to use.

| Skill | Use when |
| --- | --- |
| `promptfoo-provider-setup` | Connecting Promptfoo to a model, HTTP API, or app code. Start here for a new or broken connection. |
| `promptfoo-evals` | Writing, running, or improving non-redteam eval suites. |
| `promptfoo-redteam-setup` | Creating or refining a redteam config. |
| `promptfoo-redteam-run` | Running, inspecting, or rerunning an existing redteam scan. |

## Don't confuse these

| Pair | Difference |
| --- | --- |
| `/explain` and `/verify` | `/explain` builds your understanding. `/verify` produces evidence. Passing the quiz does not replace verification. |
| `/code-review` and `/pr-agent` | `/code-review` uses your configured reviewers. `/pr-agent` is an opt-in PR-Agent run that sends the diff to a hosted model. |
| `/security-audit` and `security-audit-reviewer` | The command audits a whole repository. The reviewer checks a diff. |
| `/perf-review` and `performance-reviewer` | The command scans the project. The reviewer checks a diff. |
| `/audit` and `/perf-review` | `/audit` looks for simplifications to data structures, state, and control flow. `/perf-review` looks for performance issues. |
| `/apply` and `sdlc-orchestrator` | `/apply` is test-first delivery of one change. The orchestrator runs the whole OpenSpec lifecycle and delegates delivery to the same pipeline. |
| `/intake` and a session checklist | The checklist tracks this session. A work item survives it. |
| `architecture-reviewer` and `architecture-boundary-reviewer` | Broad design fitness and drift versus a narrow check of changed dependency and API edges. |
| `/blindspot` and `/interview` | `/blindspot` lists what you may not know. `/interview` asks you for answers. |

## Plugins

| Plugin | State | Enable or effect |
| --- | --- | --- |
| `safety.ts` | Always on | Redacts secrets, stops repetitive tool loops, adds read-only guardrails for `explore`. |
| `crg-plugin.ts` | Always on | Starts sessions with a current code graph, logs a pre-commit change analysis, and updates the graph after edits. |
| `rtk.ts` | On when `rtk` is installed | Rewrites shell commands for token savings. Disables itself if the binary is missing. |
| `sonarqube-mcp.ts` | Per repository | Enables `sonarqube` only where `sonar-project.properties` sets `sonar.host.url`. |
| `jev-routing.ts` | Off | `OPENCODE_JEV_ROUTING=1` plus `TYPESAFE_API_KEY`. Add `OPENCODE_JEV_ROUTING_DRY_RUN=1` to log decisions without switching. |
| `tool-observation.ts` | Off | `OPENCODE_TOOL_OBSERVATION=1`. Metadata-only OTLP capture. |
| `atuin.ts` | Active when `atuin` is available | Records shell commands and working directories in Atuin history. |
| `herdr-agent-state.js` | Managed by herdr | Reinstalling herdr overwrites it. |

## Skills that only the orchestrator loads

`sdlc-discovery`, `sdlc-delivery`, and `sdlc-closure` are phase contracts that
`sdlc-orchestrator` loads as needed. See [OpenSpec setup](../README.md#openspec-sdlc-workflow)
for lifecycle skills. `/code-review` uses `difit` and `difit-review`.

## Where output goes

| Command | Path |
| --- | --- |
| `/intake` | `.agents/work/<work-id>/` |
| `/prototype` | `.agents/prototypes/<slug>/` |
| `/explain` | `.agents/docs/explainers/` |
| `/verify` | `.agents/docs/verification/` |
| `/audit` | `.agents/docs/audits/<date>-completed.md` |
| `/security-audit` | `.agents/docs/security-audits/<repo>/run-<N>` |

Restart OpenCode after changing commands, agents, skills, or plugins.
