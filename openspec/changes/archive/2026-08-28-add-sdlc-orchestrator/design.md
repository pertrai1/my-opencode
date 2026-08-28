## Context

See `proposal.md` for motivation. The current repo splits lifecycle control across separate OpenSpec command prompts under `.opencode/commands/` and an implementation-only orchestrator in `agents/tdd-orchestrator.md`. That split works for isolated workflows, but it does not provide one workflow authority that can own change selection, artifact progression, implementation routing, verification, and archive readiness. The design also needs to preserve the existing bias toward narrow permissions and separated roles.

## Goals / Non-Goals

**Goals:**
- Introduce one top-level SDLC orchestrator that owns OpenSpec workflow decisions and state transitions.
- Keep planning intelligence in high-reasoning authoring roles so implementation can stay constrained and lower effort.
- Reuse the existing `tdd-orchestrator` as the implementation subsystem instead of flattening all delivery logic into the top-level orchestrator.
- Produce a persisted change-local verification summary that supports human review and archive decisions.
- Preserve narrow permission boundaries so workflow authority, planning authoring, implementation, and verification remain distinct.

**Non-Goals:**
- Replacing the existing role-specialized implementation agents with a single coding agent.
- Turning every planning artifact into a new OpenSpec schema artifact in this first iteration.
- Fully redesigning all existing command surfaces at once beyond what is needed to route them through the orchestrator.

## Decisions

### Decision: Use one top-level lifecycle orchestrator
Create an `sdlc-orchestrator` primary agent that acts as the workflow authority for a change.

Rationale:
- One place decides store selection, change selection, stage transitions, and archive readiness.
- One place runs OpenSpec CLI commands, which keeps workflow state coherent.
- One place can convert implementation drift into planning updates instead of letting each workflow invent its own behavior.

Alternatives considered:
- Keep separate smart command prompts plus a separate implementation orchestrator: rejected because it duplicates control logic.
- Put all planning and implementation details into one giant agent with broad edit powers: rejected because it weakens safety boundaries.

### Decision: Make OpenSpec CLI ownership exclusive to the top-level orchestrator
The `sdlc-orchestrator` will be the only agent that decides and runs OpenSpec workflow actions such as `new change`, `status`, `instructions`, `validate`, and `archive`.

Rationale:
- OpenSpec workflow state becomes a single source of truth.
- Planning and delivery subagents can stay focused on their artifact or role.
- Status re-checks after every state-changing step become consistent.

Alternatives considered:
- Allow planning authors to run `openspec instructions` or `status`: rejected because it blurs workflow authority.
- Let wrapper commands continue to contain most workflow logic: rejected because it keeps the split-brain model.

### Decision: Separate high-reasoning planning from lower-reasoning execution
Planning roles will use stronger reasoning and own ambiguity resolution:
- `proposal-author`
- `spec-author`
- `design-author`
- `task-planner`

Execution will remain constrained and narrower in scope:
- `tdd-orchestrator`
- `type-author`
- `test-author`
- `implementer`

Rationale:
- This front-loads product and technical judgment into artifacts instead of hoping a coding agent rediscovers it correctly.
- Good tasks reduce the reasoning burden on implementation.

Alternatives considered:
- Use the same reasoning level across all agents: rejected because it spends expensive cognition on work that should be constrained by better specs and tasks.

### Decision: Keep the existing TDD orchestrator as a delegated implementation subsystem
The top-level orchestrator will delegate implementation-ready work to `tdd-orchestrator` instead of directly managing contract, RED, and GREEN phases.

Rationale:
- The existing implementation pipeline already encodes useful anti-bias boundaries.
- This avoids duplicating type/test/code orchestration rules in two places.

Alternatives considered:
- Collapse the TDD pipeline into the top-level orchestrator: rejected for v1 because it adds prompt complexity without changing the core architecture.

### Decision: Add a persisted verification summary artifact for human review
Each change will include a change-local persisted summary artifact, referred to here as `verification.md`, that records:
- intended outcome
- completed work
- evidence checked
- material actions intentionally not taken during verification
- relevant changed areas
- divergences from artifacts
- open issues or risks
- recommendation for human approval and archive readiness

Rationale:
- A human should not need raw session output to understand what happened.
- Verification needs both a workflow verdict and a handoff summary.

Alternatives considered:
- Keep summaries only in chat output: rejected because they are easy to lose and do not travel with the change.
- Store summaries outside the change: rejected because approval context should stay attached to the change.

For v1, `verification.md` will be an orchestrator-managed change convention rather than a first-class schema artifact. This keeps the first implementation focused on orchestration behavior and summary quality without requiring a schema migration up front.

### Decision: Introduce an explicit human approval gate before archive
The lifecycle will include a review checkpoint after verification and before archive.

Rationale:
- The user explicitly wants a human in the loop.
- Archive is a durable workflow step and should be backed by persisted evidence.

Alternatives considered:
- Archive automatically after checks pass: rejected because it bypasses the desired review loop.

### Decision: The top-level orchestrator owns task completion state
The `sdlc-orchestrator` will update task checkboxes only after it has verified that the delegated work for that task is complete.

Rationale:
- Task completion is a workflow judgment, not just a claim from a delivery subagent.
- This keeps progress reporting and archive readiness anchored to the workflow authority.

Alternatives considered:
- Let the delegated implementation subsystem mark tasks complete on its own: rejected because it weakens the top-level verification gate.

### Decision: Discover target workspace evidence with fixed precedence
The orchestrator will separate control-plane (this harness) from execution-plane (selected target repository), and always discover target workspace evidence before deciding verification strategy and command routing.

Discovery precedence (must be checked in order):
1. `openspec`-resolved target path and active workspace context
2. Repository-specific policy and domain context files:
   - `AGENTS.md`
   - `README*`
   - `CONTEXT.md` or `CONTEXT-MAP.md`
   - Relevant ADR files in repository ADR paths
3. Repository toolchain indicators:
   - Package-manager lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`)
   - `package.json` scripts
   - TypeScript/JavaScript config files (`tsconfig*`, `jsconfig*`, Babel/ESM config)
4. Test/lint/tooling configuration and existing test files
5. Public exports / entry-point surfaces (e.g., package exports, main/module, index files)

This allows portable operation because command selection is always evidence-driven rather than harness-specific.

### Decision: Portable command and verifier selection rules
Command selection SHALL favor project-declared scripts from `package.json`; when absent, it SHALL infer commands from repository language/tooling evidence.

Verifier selection SHALL be:
- **TypeScript repos**: project-declared typecheck if present, else `tsc --noEmit`
- **JavaScript repos with checkJs**: `tsc --checkJs`
- **Plain JavaScript without viable typechecker**: explicit `no-contract mode` is required before implementation delegation

Package-manager selection SHALL be lockfile-driven, not hard-coded:
- Use `npm` only for npm-style lockfiles, `yarn` for yarn lockfile evidence, `pnpm` for pnpm lockfile evidence, and `bun` for Bun lock evidence, unless target-specific override evidence is available.

The top-level orchestrator remains the only agent that runs OpenSpec lifecycle commands (`openspec status`, `instructions`, `new change`, `archive`, etc.); delegated agents do not own lifecycle transitions.

## Risks / Trade-offs

- [Prompt complexity in the top-level orchestrator] -> Mitigation: keep implementation details delegated to `tdd-orchestrator` and keep writer agents artifact-specific.
- [Handoff overhead between planning agents] -> Mitigation: use a small initial roster and let the orchestrator pass concrete artifact instructions and dependencies.
- [Verification summary becomes stale after later edits] -> Mitigation: require the orchestrator to refresh `verification.md` after each meaningful verification pass.
- [Tasks remain too vague for low-reasoning execution] -> Mitigation: make execution readiness an explicit gate before implementation starts.

## Migration Plan

1. Add the new `sdlc-orchestrator` primary agent.
2. Add planning-focused artifact author agents with narrow write scopes.
3. Route existing OpenSpec command entrypoints through the new orchestrator instead of embedding most workflow logic in each command.
4. Define the persisted `verification.md` summary contract and the verification agent that writes it.
5. Integrate the existing `tdd-orchestrator` as the implementation subsystem for implementation-ready tasks.
6. Move task completion updates to the top-level orchestrator after successful verification of each completed task or slice.
7. Verify the full path on one change lifecycle: new change, planning, implementation delegation, verification summary, task state update, and archive recommendation.
