---
name: sdlc-closure
description: Phase contract used only by the sdlc-orchestrator agent. Covers the change-verifier handoff and verification.md contract, human approval, delta spec sync, and archive preconditions. Load it when entering verification, human approval, or archive readiness.
---

# SDLC: Verification, approval and archive

Phase contract for `sdlc-orchestrator`. It does not grant permissions or lifecycle
authority to delegated roles. Rules that apply in every phase, store selection, and
task completion authority stay in the agent definition.

## Verification workflow

Use verification as a distinct gate between implementation and human approval.

### Verification handoff to `change-verifier`

When an implementation slice or change claims completion, delegate verification with:

- active change identity and selected target root;
- proposal, spec, design, and tasks artifacts for the active change;
- current coordination notes from `progress.md` and `intent.md`;
- implementation return summaries and verifier/test/typecheck evidence;
- relevant changed files or changed areas;
- current task ids claimed as complete.

Require the `change-verifier` to compare artifacts, task state, and implementation evidence, then classify results as:

- `blocking`
- `warning`
- `clear`

Require the verifier to write a persisted `verification.md` using this contract:

- `# Verification: <change-name>`
- `## Intent`
- `## Completed Work`
- `## Evidence Checked`
- `## Functional Check`
- `## Test Coverage Check`
- `## Integration Check`
- `## Documentation Impact`
- `## Scope Control`
- `## Unverified Areas`
- `## Actions Not Taken`
- `## Changed Areas`
- `## Task State Check`
- `## Findings`
- `## Divergences`
- `## Recommendation`

Require `## Actions Not Taken` to log material verification actions that were intentionally skipped, deferred, or left to the human or orchestrator, with reasons. Do not require trivial non-actions.
Require every judgment area with missing evidence to be marked explicitly as `unverified` instead of being omitted or implied to pass.

The orchestrator must treat `verification.md` as the canonical human review surface for the current verified state.

### Verification gate behavior

- Do not enter `archive-readiness` unless verification has run for the current claimed state.
- Treat `blocking` findings as lifecycle blockers. Leave affected tasks incomplete until resolved or explicitly accepted by the human.
- Treat `warning` findings as visible review concerns. Record them and carry them forward to human approval.
- Treat `clear` as sufficient to advance to human approval if other workflow requirements are satisfied.

## Human approval and archive gate

Use `verification.md` as the review surface for the human-in-the-loop before any archive step.

### Human approval handoff

Before asking for archive approval, present from `verification.md`:

- the verified intent of the change;
- completed work and claimed incomplete work;
- evidence checked and any human-confirmed command results;
- functional proof, test coverage, integration status, documentation impact, scope control, and any explicitly unverified areas;
- material verification actions not taken or deferred;
- blocking findings, warnings, and divergences;
- material decisions, assumptions, changed defaults and compatibility effects;
- the proposed review risk and specific unresolved choices or evidence gaps the
  human must accept or redirect, rather than a generic request to approve;
- the current recommendation.

### Archive-readiness prerequisites

Do not enter `archive-readiness` or run `openspec archive` unless all of the following are true:

- `verification.md` exists for the current claimed state;
- `verification.md` contains all required sections from the verification contract;
- any missing verification judgment is explicitly marked `unverified` with a reason rather than omitted;
- there are no unresolved `blocking` findings unless the human explicitly accepts them;
- required tasks for the claimed completed scope are marked complete and supported by verification evidence;
- no newer planning or implementation change has invalidated the current verification state;
- the human has been shown the current `verification.md` summary and has had a chance to approve or redirect.

### Human gate behavior

- If the human requests changes, route back to planning or delivery as appropriate and treat the previous verification state as stale until re-run.
- If the human asks a clarifying question, answer from the evidence when possible; otherwise pause and gather the missing evidence before continuing.
- If the human does not approve archive, stop before `openspec archive` and record the reason in coordination notes.
- If verification is stale because planning, tasks, or implementation changed after the summary was written, re-run verification before asking for approval again.

## Delta spec sync and archive preconditions

When a change has delta specs and the user requests sync or archive, keep sync as an explicit orchestrated subflow.

### Sync assessment

- Use `openspec status` and the resolved `artifactPaths.specs.existingOutputPaths` as the only delta-spec source.
- If no delta specs exist, record that state and continue without sync.
- If delta specs exist, compare each delta against its corresponding main spec path under the resolved planning root.
- Show the combined sync state before archive and ask the user when sync is optional.

### Sync preparation

- Before any main-spec write, run `openspec instructions specs` for the selected change and use the returned rules only for the sync content and form.
- Delegate the actual main-spec update to `spec-syncer`.
- Provide `spec-syncer` with the delta paths, resolved main spec paths, sync rules, and any user choice about sync scope.

### Post-sync verification

- Re-check every capability with a delta spec, not just the files reported as touched by the sync result.
- If any delta is still unapplied or ambiguous after sync, stop and do not advance to archive.
- Record sync results and blockers in coordination notes and, when relevant, `verification.md`.

### Archive coupling

- Never run `openspec archive` while sync work is unresolved or still in flight.
- Treat failed or incomplete sync as an archive blocker unless the user explicitly chooses an allowed no-sync path and the workflow permits it.

### Verification routing rules

- If verification shows implementation drift or missing planning clarity, route back to the owning planning role.
- If verification shows incomplete or failed delivery evidence, route back to the delivery path.
- If verification shows out-of-scope work or important unverified areas, pause and surface that state before archive-readiness decisions.
- If verification depends on a human judgment call, pause and ask the user with the evidence summary.
- Record the verification verdict and follow-up route in `verification.md` and coordination notes before the next lifecycle transition.

If `verification.md` is missing required sections or does not match the verified evidence, treat verification as incomplete and re-run or escalate instead of advancing.
