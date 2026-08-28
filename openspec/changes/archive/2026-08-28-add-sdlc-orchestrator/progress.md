# Progress: add-sdlc-orchestrator

## Verification conventions

- Type checker: `npm run typecheck`
- Test command: `npm test`
- Lint command when relevant: `npm run lint`
- OpenSpec planning artifacts are complete; implementation tasks are in `tasks.md`.

## Active slice

- Task 1.1: completed — added the `sdlc-orchestrator` primary agent with orchestrator-only OpenSpec CLI ownership.
- Classification: direct-task mode because this slice is configuration-only.
- Task 1.2 is paused while the approved portability clarification is incorporated into the OpenSpec artifacts.

## Scope clarification

- This repository is the OpenCode harness, not the implementation target.
- The SDLC orchestrator must operate on any in-scope TypeScript or JavaScript repository by discovering project instructions, architecture context, package manager, scripts, type-checking mode, and test conventions from repository evidence.
- The proposal, spec, design, and tasks now encode target-workspace discovery, evidence precedence, package-manager-aware command selection, and TypeScript/checkJs/no-contract verification modes.
- Plain JavaScript without a viable type checker explicitly remains behavioral no-contract RED -> GREEN work; it is not documentation-only.

## Completed slices

- Task 1.1: added `agents/sdlc-orchestrator.md`; human-confirmed verifier success after the permission reload.
- Task 1.2: added explicit lifecycle states, forward and drift transitions, pause conditions, three-attempt escalation, and planning-owner reauthorization rules. `llm-core` lint passed.
- Task 1.3: added target-workspace selection, OpenSpec-resolved target/root binding, target confirmation, coordination-note recording, and ambiguity/no-contract evidence pause rules. `llm-core` lint passed.
- Task 1.4: added ordered target evidence collection, conflict escalation, command-selection evidence recording, and named public API provenance for no-contract RED handoffs. `llm-core` lint passed.
- Task 2.1: added high-reasoning `proposal-author`, `spec-author`, `design-author`, and `task-planner` subagents with default-deny, artifact-specific write scopes and no lifecycle command ownership. File-level permission and prompt inspection passed.
- Task 2.2: wired the top-level orchestrator to the planning authors with artifact-specific handoffs, post-handoff status/ambiguity checks, and an execution-readiness gate. `llm-core` lint passed.
- Task 3.1: added a constrained behavioral delivery handoff to `tdd-orchestrator`, including target/slice/evidence/mode context and post-return validation without duplicating the TDD phases. `llm-core` lint passed.
- Task 3.2: granted completion-only `tasks.md` authority to the top-level orchestrator, with evidence requirements and a prohibition on editing task wording or order. File inspection passed.
- Task 3.3: added script-first, package-manager-aware command selection with lockfile mapping, narrow fallback rules, and user escalation for ambiguous command choices. File inspection passed.
- Task 3.4: added explicit verifier-mode selection for TypeScript, `checkJs`, and no-contract targets, and aligned the orchestrator permission allowlist with both `tsc --noEmit` and `tsc --checkJs`. File inspection passed.
- Task 4.1: added a high-reasoning `change-verifier` role and a top-level verification gate that compares artifacts, task claims, and implementation evidence before archive readiness. File inspection passed.
- Task 4.2: defined the persisted `verification.md` contract and made it the canonical human review surface for the current verified state. File inspection passed.
- Task 4.3: tightened the human approval and archive gate around a current `verification.md`, supported task state, and explicit user review opportunity. File inspection passed.
- Task 5.1: converted the `opsx-*` command entrypoints into thin wrappers that preserve command intent while delegating lifecycle control to `sdlc-orchestrator`. File inspection passed.
- Task 5.2: rehearsed the documented flow from scaffold through archive recommendation. The rehearsal exposed a missing main-spec sync owner, which was fixed by adding `spec-syncer` plus explicit sync/archive orchestration rules. End-to-end prompt flow is now coherent by file inspection.

## Active slice

- Verified task state updated in `tasks.md` for completed slices 1.1 through 3.2.
- Verified task state updated in `tasks.md` through task 3.3.
- Verified task state updated in `tasks.md` through task 3.4.
- Verified task state updated in `tasks.md` through task 4.1.
- Verified task state updated in `tasks.md` through task 4.2.
- Verified task state updated in `tasks.md` through task 4.3.
- Verified task state updated in `tasks.md` through task 5.2.

## Rehearsal notes

- Rehearsed path: `/opsx-new` -> `/opsx-continue` -> `/opsx-apply` -> delegated `tdd-orchestrator` -> `change-verifier` writing `verification.md` -> human approval -> optional delta spec sync -> `/opsx-archive`.
- Gap found during rehearsal: no dedicated main-spec sync writer after command-wrapper migration.
- Fix applied: added `agents/spec-syncer.md` and explicit sync assessment, preparation, post-sync verification, and archive coupling rules to `agents/sdlc-orchestrator.md`.
- Result: the command surface, orchestrator, planning authors, delivery handoff, verification summary, human gate, and archive path now form one connected lifecycle.
- Implementation claim: `agents/sdlc-orchestrator.md` was added and passes file-level scope inspection plus `llm-core` linting.
- Blocker: the required TypeScript verifier cannot execute in this session. Both `npm run typecheck` and the equivalent `tsc --noEmit` were denied by the active tool permission envelope before execution. Do not mark task 1.1 complete until the verifier runs successfully.
- Permission correction: `agents/sdlc-orchestrator.md` now explicitly permits `npm test*`, `npm run test*`, `npm run typecheck`, `npm run lint*`, `tsc --noEmit`, and `npx tsc --noEmit` while retaining a default-deny Bash policy. A new agent session is required for the changed configuration to take effect.
- Human verification: after reloading permissions, the user ran the required commands successfully with no errors. Task 1.1 may proceed as verified by the human-in-the-loop.

## Worktree note

- The repository contained pre-existing untracked OpenSpec skills and `.opencode/` content before this implementation session. Preserve unrelated work.
