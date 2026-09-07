# Verification: add-oracle-and-do-nothing-verifiers

## Intent
Integrate Oracle Verifier (anti-false-negative / baseline preflight) and Do-Nothing Verifier (anti-false-positive / anti-vacuous test sensitivity) guardrails into `my-opencode` agent definitions, verification guidance, and SDLC specifications, inspired by terminal agent harness research (arXiv:2609.04128).

## Completed Work
- Updated `agents/change-verifier.md` to require baseline sensitivity ("Do-Nothing" check) on newly authored functional or integration verification checks.
- Updated `agents/test-reviewer.md` to audit diffs for tautological tests, empty assertions, and unexercised mocks.
- Updated `agents/tdd-orchestrator.md` to run a pre-flight baseline Oracle check and formalize Phase 1 RED testing as an explicit Do-Nothing verifier.
- Updated `.agents/docs/verification/README.md` and `README.md` to canonize Oracle and Do-Nothing verification standards.
- Authored OpenSpec change artifacts (`proposal.md`, `design.md`, `tasks.md`, `intent.md`, `progress.md`, delta specs).

## Evidence Checked
- Repository linters (`npm run lint`), typechecker (`npm run typecheck`), and unit tests (`npm test`) executed on branch `feature/issue-36-oracle-and-do-nothing-verifiers`.
- Git status and diff inspections confirming clean and targeted changes.
- Pre-flight baseline and post-change test runs.

## Functional Check
- Agent instruction files (`change-verifier.md`, `test-reviewer.md`, `tdd-orchestrator.md`) accurately reflect the new verification rules without breaking existing prompts or schema properties.
- Verification guide (`.agents/docs/verification/README.md`) contains concrete guidelines on establishing negative baseline proof.

## Test Coverage Check
- Ran existing repository test suite (`npm test`), which passed with 0 failures.
- No executable code runtime regressions introduced; changes are agent instructions, documentation, and OpenSpec artifacts.

## Integration Check
- Agent YAML frontmatter and model configurations validated.
- Cross-references across `README.md`, `AGENTS.md`, and OpenSpec specs verified.

## Documentation Impact
- `.agents/docs/verification/README.md` updated with Section 4.1: "Oracle and Do-Nothing Verification Standards".
- `README.md` updated under Verification with Oracle baseline and Do-Nothing anti-vacuity notes.

## Scope Control
- Scope stayed strictly within agent prompts, verification documentation, and OpenSpec artifacts. No unrelated configuration or files were modified.

## Unverified Areas
- None.

## Actions Not Taken
- Automated execution of `checks-runner.mjs` against external target repositories was deferred as this change modifies harness configuration and prompt guidance, not external targets.

## Changed Areas
- `agents/change-verifier.md`
- `agents/test-reviewer.md`
- `agents/tdd-orchestrator.md`
- `.agents/docs/verification/README.md`
- `README.md`
- `openspec/changes/2026-09-07-add-oracle-and-do-nothing-verifiers/*`

## Task State Check
- Tasks 1 through 6 in `tasks.md` are supported by concrete evidence.

## Findings
- None. (Verdict: Clear)

## Divergences
- None.

## Recommendation
- Ready for human approval.
