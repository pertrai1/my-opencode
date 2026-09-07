# Design: Oracle and Do-Nothing Verifier Integration

## Architecture Overview

This design formalizes two complementary verification gates derived from terminal agent harness research:

1. **Oracle Verifier (Anti-False-Negative Gate)**:
   - Verifies the known-correct or clean starting baseline.
   - Run during pre-flight before Phase 0 / Phase 1 in `tdd-orchestrator` and during baseline checks in `checks-runner.mjs`.
   - Prevents an agent from misinterpreting pre-existing repository defects as regressions caused by its own task.
   - For refactoring / algorithmic optimizations, defines differential testing against an existing reference implementation ("golden master oracle").

2. **Do-Nothing / Invalid-Test Verifier (Anti-False-Positive Gate)**:
   - Proves that a test or verification assertion fails on unmodified code or against the pre-change baseline commit (`git merge-base` or initial worktree state).
   - In `tdd-orchestrator`, formalizes Phase 1 (RED) testing as a strict do-nothing check: the test must fail specifically for the missing behavior, not for an unrelated harness/syntax error or pass vacously.
   - In `change-verifier`, requires that functional checks and verification scripts authored for change sign-off demonstrate sensitivity by confirming failure against the unpatched baseline.
   - In `test-reviewer`, adds explicit rubrics to identify tautological tests, empty assertions, and unexercised mocks.

## Agent Changes

### 1. `agents/change-verifier.md`
- Update `Functional Check` and `Evidence Checked` rubric requirements:
  - When new functional or smoke checks are introduced as proof of work, require evidence that the check was executed (or logically evaluated) against the baseline state to ensure it does not vacuously pass.
  - Flag any verification check that passes on the baseline without the change as a `warning` or `blocking` defect (tautological verification).

### 2. `agents/test-reviewer.md`
- Add a new focus area under test quality:
  - "tautological tests or assertions that pass regardless of implementation state (missing do-nothing/mutation sensitivity)"
  - "assertions on mocked values rather than observable side-effects or return values"
  - "missing baseline or negative-case verification"

### 3. `agents/tdd-orchestrator.md`
- Under **Intake / Pre-flight**:
  - Add explicit "Pre-flight Baseline Oracle Check": run the target repository's verifier command (`checks-runner` or declared check) on the untouched worktree before Phase 0/1. Record baseline status in `progress.md` so existing failures are quarantined from the current task scope.
- Under **RED integrity rules**:
  - Re-emphasize Phase 1 as a "Do-Nothing Verifier": the test must be proven to fail on the unmodified implementation, asserting the exact behavioral gap.

## Documentation Changes

- **`.agents/docs/verification/README.md`**:
  - Add a dedicated subsection in Section 4 ("Evidence Expectations") on Oracle and Do-Nothing verification standards.
- **`README.md`**:
  - Update Verification summary to mention Oracle baseline checks and Do-Nothing anti-vacuity guardrails.
