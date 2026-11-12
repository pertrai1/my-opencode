# SDLC: Planning and delivery

Phase reference for `sdlc-orchestrator`. Read before entering the relevant phase;
this document does not grant permissions or lifecycle authority to delegated roles.

## Planning delegation and planning handoff contract

### Allowed planning delegation targets

Delegate planning updates to role-specific planning authors only:

- `proposal` artifact → `proposal-author`
- `delta specs` artifact → `spec-author`
- `design` artifact → `design-author`
- `tasks` artifact → `task-planner`

### Planning handoff contract

Every planning handoff must include:

- resolved artifact output path from OpenSpec instructions (exact path)
- artifact-specific instructions from `openspec instructions`
- completed dependency artifacts required by the target artifact
- applicable target-evidence summary for scope and constraints
- allowed edit scope (including explicit surface boundaries)
- current artifact requirement to satisfy next
- required structured result format expected from the planning author

The orchestrator must re-check `openspec status` after each planning artifact handoff returns, then:

- inspect returned ambiguity claims,
- record and route unresolved points to the owning planning role,
- never let planning authors decide lifecycle transitions.

### Execution-readiness gate before implementation

Before any implementation delegation, verify all of the following:

- requirements/spec scenarios are concrete,
- material design choices are resolved,
- tasks are independently verifiable and ordered,
- expected verification commands and verifier mode (`type` / `no-contract`) are recorded,
- no material ambiguity remains.

If this gate fails, do not delegate implementation. Route back to the owning planning role or escalate to the human with blockers and evidence.

### Lifecycle control reminder

No planning author may own or decide lifecycle transitions. The orchestrator keeps command-level lifecycle control and only advances on verified conditions.

## Delegation to `tdd-orchestrator`

### Delivery handoff contract for implementation-ready behavioral slices

Use this handoff whenever a slice is behavioral and passes the execution-readiness gate.

- Explicitly include in every handoff:

  - **target context**:
    - selected target root and selected change path from OpenSpec outputs;
    - evidence that the target was selected (state lines, resolved path, and active change record).
  - **slice/task identity**:
    - active task id from planning (`tasks.md`);
    - any completed prerequisite planning artifacts (`proposal.md`, `spec.md`, `design.md`, and current `tasks.md` scope).
  - **evidence for command selection**:
    - target toolchain and command source, including package manager/lockfile when applicable;
    - selected test and typecheck command(s);
    - whether execution is `type` mode or `no-contract` mode.
  - **public surface constraints**:
    - allowed scope for the behavioral slice (artifact paths and acceptance boundary);
    - any no-contract public API source-of-truth and exact signature used for RED test generation.
- **expected acceptance and return format**:
  - acceptance condition for the slice (what must be observed as completed);
  - for JavaScript or TypeScript implementation work with multi-file edits or refactor risk, instruction for `tdd-orchestrator` to include a final `node ~/.config/opencode/scripts/halstead-analyzer.js --git-changed` or `--git-diff-base <base-ref>` complexity check in the implementer handoff;
  - required return schema that `tdd-orchestrator` must emit.

- The top-level orchestrator must **not** prescribe implementation strategy, architecture changes, or provide type-author/test-author/implementer workflow details. It must provide only the handoff constraints above and then defer to `tdd-orchestrator` for contract/RED/GREEN orchestration.

- On return from `tdd-orchestrator`, the orchestrator must validate output against task/spec evidence and record results in coordination files before moving lifecycle state:

  - verify the handoff contract fields were satisfied from returned evidence;
  - verify that each claimed scope change aligns with `proposal/spec/design/tasks` and target evidence;
  - append a concise, evidence-backed result note to `progress.md` or `intent.md`.

- If behavior appears off-scope, ambiguous, contradictory, or implementation drift is detected, route the change back to planning:

  - do **not** fix drift in place,
  - return control to the owning planning artifacts/roles for rework and reauthorization,
  - only resume implementation after an updated planning pass clears the blocker.

### Behavioral vs direct-task routing

- Keep config-only, docs-only, or trivial non-behavioral changes as direct-task mode for `implementer` with explicit acceptance criteria and verification constraints.
- For JavaScript or TypeScript direct-task coding work with multi-file edits or refactor risk, tell `implementer` to run `node ~/.config/opencode/scripts/halstead-analyzer.js --git-changed` or `--git-diff-base <base-ref>` as a final anti-slop complexity check.
- Route behavioral implementation work exclusively to `tdd-orchestrator`, and only after the execution-readiness gate passes.
- Never mark readiness for `tdd-orchestrator` handoff if any readiness condition is unresolved.

## Task completion authority

You own task completion state for the active change, but only as a verification ledger.

- Planning authors create and reorder task content.
- Delivery agents may claim completion in their return summaries, but they do not edit `tasks.md`.
- You may change a task checkbox from `- [ ]` to `- [x]` only after you verify that the task's acceptance and required evidence are satisfied.

Before marking a task complete, confirm all of the following:

- the delegated result maps to the intended task id and description in `tasks.md`;
- the claimed work stays within the allowed scope for that slice;
- required verifier output or human-confirmed verifier success is recorded in `progress.md`, `intent.md`, or `verification.md`;
- the result does not conflict with proposal, spec, design, or task intent;
- no unresolved blocker or material ambiguity remains for that task.

When updating `tasks.md`:

- change only the existing checkbox state for the verified task line;
- do not rewrite task wording, reorder tasks, add tasks, or remove tasks;
- if task content itself needs to change, route back to `task-planner` instead of editing it directly;
- record the completion evidence and date/context in a coordination file before or immediately after the checkbox update.

If verification fails or evidence is incomplete:

- leave the checkbox as `- [ ]`;
- record the blocker and evidence gap;
- route back to delivery, planning, or the human as required by the failure mode.
