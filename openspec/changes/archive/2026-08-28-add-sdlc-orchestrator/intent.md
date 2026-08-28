# Intent: add-sdlc-orchestrator

## Implementation record

The change will be completed one `tasks.md` slice at a time. Planning and verification roles use higher reasoning; implementation remains constrained by scoped prompts and permissions. The top-level orchestrator owns OpenSpec workflow commands and task completion state.

The harness configuration repository is not the target repository. Target-repository discovery must use applicable project instructions and local evidence before selecting commands or delivery mode.

The portability clarification was captured in the change artifacts. The next implementation slice is task 1.3, followed by evidence-precedence task 1.4.

Task 1.2 is complete by file inspection and lint. It explicitly requires implementation drift and material ambiguity to return to the owning planning role, with a three-attempt cap per phase.

Task 1.3 is complete by file inspection and lint. It binds lifecycle decisions to the selected target workspace rather than this harness repository.

Task 1.4 is complete by file inspection and lint. Commands and delivery mode must be selected from ordered target-repository evidence and recorded before delegation.

Task 2.1 is complete by file-level inspection. Planning intelligence is assigned to four high-reasoning, artifact-scoped writers; execution remains delegated to the existing constrained TDD roles.

Task 2.2 is complete by file inspection and lint. The top-level agent controls planning handoff and readiness, while artifact authors remain unable to control lifecycle transitions.

Task 3.1 is complete by file inspection and lint. Behavioral implementation flows through `tdd-orchestrator`; config/docs/trivial work remains direct-task mode.

Task 3.2 is complete by file inspection. The top-level orchestrator can now update `tasks.md` only as a verified completion ledger, never as a task author.

Task 3.3 is complete by file inspection. Target command invocation is now script-first and package-manager aware, with explicit ask-the-user behavior when command evidence is ambiguous.

Task 3.4 is complete by file inspection. Delivery mode now binds to target evidence across TypeScript, `checkJs`, and no-contract repositories, and the orchestrator permission allowlist matches those verifier branches.

Task 4.1 is complete by file inspection. Verification is now a first-class delegated gate with explicit `blocking`, `warning`, and `clear` outcomes before archive readiness.

Task 4.2 is complete by file inspection. `verification.md` now has a fixed evidence-backed structure and serves as the persisted summary for the human in the loop.

Task 4.3 is complete by file inspection. Archive is now explicitly gated on a current verification summary, supported task state, and an actual human approval opportunity.

Task 5.1 is complete by file inspection. The `opsx-*` command prompts are now thin intent wrappers instead of parallel workflow engines.

Task 5.2 is complete by rehearsal and file inspection. The only material orchestration gap discovered was delta-spec sync ownership before archive, which is now covered by `spec-syncer` and top-level sync/archive rules.

## Slice 1.1

- Mode: direct-task (configuration-only)
- Acceptance: introduce a primary `sdlc-orchestrator` agent whose prompt and permission boundary make it the sole owner of OpenSpec workflow commands, lifecycle state transitions, and subagent delegation.
- Evidence required: inspect the agent definition and run `npm run typecheck`.
- Evidence obtained: `agents/sdlc-orchestrator.md` inspected; `llm-core` lint returned no findings.
- Verification blocked: the session denied both `npm run typecheck` and `tsc --noEmit` before they executed. The task remains unverified and incomplete.
- Follow-up: expanded the new agent's targeted verifier allowlist. Verification must be retried from a new session after OpenCode restarts or reloads its configuration.
- Human-supplied verification: the user confirmed the commands ran without errors after the permission reload. Task 1.1 is accepted; proceed to task 1.2.
