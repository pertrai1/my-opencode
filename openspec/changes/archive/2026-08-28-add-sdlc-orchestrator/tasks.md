## 1. Top-Level Orchestrator

- [x] 1.1 Add an `sdlc-orchestrator` primary agent that owns OpenSpec CLI workflow actions, change lifecycle state transitions, and delegation rules, and verify its prompt and permissions reflect orchestrator-only control over `openspec` commands.
- [x] 1.2 Define the orchestrator's explicit lifecycle states, pause conditions, and escalation rules for planning ambiguity, implementation drift, verification failures, and archive readiness, and verify the prompt documents each transition path clearly.
- [x] 1.3 Define target-repository discovery procedure for an active workspace and verify the orchestrator uses `openspec` discovery outputs plus target-root evidence before delegating implementation (must validate harness workspace is not treated as target).
- [x] 1.4 Add evidence-precedence checks for target workspace files (`AGENTS.md`, `README*`, `CONTEXT*`, ADRs, lockfiles, scripts, configs, tests, exports) and verify the chosen evidence list is persisted in coordination notes before command selection.

## 2. Planning Authoring Roles

- [x] 2.1 Add high-reasoning planning agents for proposal, spec, design, and task authoring with narrow artifact-specific write scopes, and verify each agent can edit only its assigned planning artifact type.
- [x] 2.2 Update planning handoff rules so the orchestrator passes OpenSpec instruction output, dependency artifacts, and execution-readiness expectations to those planning agents, and verify the prompts require ambiguity resolution before implementation.

## 3. Delivery and Progress Control

- [x] 3.1 Integrate the existing `tdd-orchestrator` as the delegated implementation subsystem for implementation-ready work, and verify the top-level orchestrator hands off delivery without duplicating the contract, RED, and GREEN workflow.
- [x] 3.2 Move task completion authority to the top-level orchestrator so task checkboxes are updated only after verified completion, and verify the workflow describes when a task is allowed to change from `- [ ]` to `- [x]`.

- [x] 3.3 Implement portable command-selection rules (script-first, then inferred fallback) and verify npm/yarn/pnpm/bun command paths are selected from lockfile evidence rather than hard-coded npm assumptions.
- [x] 3.4 Implement verifier-mode selection rules (`tsc --noEmit`, `tsc --checkJs`, explicit no-contract path) and verify each branch is mapped to observed target evidence before tdd-orchestrator/implementer delegation.

## 4. Verification and Human Review

- [x] 4.1 Add a verification workflow that compares artifacts, task state, and implementation evidence, and verify it can distinguish blocking issues from warnings before archive readiness is reported.
- [x] 4.2 Add a persisted change-local `verification.md` summary contract that records intent, completed work, evidence checked, changed areas, divergences, open issues, and recommendation, and verify the contract is documented for human review use.
- [x] 4.3 Add an explicit human approval gate before archive that presents `verification.md` as the review surface, and verify the orchestrator prevents archive when required work or blocking verification findings remain unresolved.

## 5. Command Surface Migration

- [x] 5.1 Update the OpenSpec command entrypoints so they route through the SDLC orchestrator instead of each command prompt owning separate lifecycle logic, and verify each entrypoint still preserves its user-facing intent.
- [x] 5.2 Run a focused end-to-end rehearsal for one change lifecycle covering scaffold, planning, delegated implementation, verification summary generation, and archive recommendation, and verify the documented workflow remains coherent across all stages.
