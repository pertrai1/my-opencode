# Proposal: Add Oracle and Do-Nothing Verifier Guardrails to Agent Verification Harnesses

## Why

Research in agent evaluation harnesses (*Environment Evolution for Terminal Agents*, arXiv:2609.04128) highlights two primary failure modes in automated agent verification:
1. **Unsolvable Tasks / False Negatives**: When tests or environments are broken, contradictory, or fail before the agent touches anything, misattributing baseline repository failures to the current change.
2. **Vacuous Passes / False Positives**: When tests or verification scripts pass trivially because the check passes on unmodified code (e.g. assertions on preexisting outputs, tautological tests, or assertions satisfied by default initial states).

In `my-opencode`, while `tdd-orchestrator` implements an initial RED phase check, the broader SDLC lacks formalized **Oracle** and **Do-Nothing** verification guardrails across `change-verifier`, `test-reviewer`, and overall verification documentation.

## What Changes

- **`agents/change-verifier.md`**: Require that new functional, smoke, or verification checks authored for change sign-off be verified against the pre-change baseline (e.g. git merge-base or unmodified code) to confirm they actually fail prior to the change ("Do-Nothing" check), preventing vacuous passes.
- **`agents/test-reviewer.md`**: Add explicit review rubrics to detect and flag tautological tests, mock leakage, vacuous assertions, and tests that still pass when the underlying diff is disabled/commented out.
- **`agents/tdd-orchestrator.md`**: Formalize the pre-flight baseline check as an Oracle Verifier step (capturing repo check state before Phase 0/1 to separate pre-existing issues from new regressions) and explicitly document the RED phase as an anti-vacuous Do-Nothing gate.
- **`.agents/docs/verification/README.md` & `README.md`**: Document Oracle and Do-Nothing verification standards in the canonical verification guide and project documentation.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `sdlc-orchestrator`: Incorporates baseline oracle verification and do-nothing anti-vacuity expectations into verification gates.
- `change-verifier`: Enforces baseline check failure ("do-nothing" test) for functional and integration checks before archive readiness.
- `test-reviewer`: Inspects test diffs for tautologies, missing negative cases, and vacuous passes.

## Impact

- Modified: `agents/change-verifier.md`, `agents/test-reviewer.md`, `agents/tdd-orchestrator.md`.
- Modified documentation: `.agents/docs/verification/README.md`, `README.md`.
- No new external runtime dependencies or breaking configuration changes.
