# Git test isolation

Execution state: draft PR awaiting owner review.

## Acceptance criteria

- npm test clears repository-local Git variables before test code loads.
- Contaminated test fixtures do not change parent index or refs.
- Existing tests and verification remain passing.

## Checklist

- [x] Inspect current main, hooks, UBS, fixtures and open PRs (none).
- [x] Reproduce parent index mutation in disposable repositories, not a real checkout.
- [x] Add preload using Git's own local environment variable list and regression.
- [x] Run full verification and independent review.
- [x] Open draft [PR #106](https://github.com/pertrai1/my-opencode/pull/106).
- [x] Verify implementation-head CI at `cb34661f3fb79d05040825416978ee3b130f3fbe`: [passed](https://github.com/pertrai1/my-opencode/actions/runs/43234561200).

## Evidence

Regression failed before fix with both parent index and branch ref changes, passed afterward.
The regression models hook-exported variables using disposable repositories; it does not claim a real hook end-to-end test.
Graph and CodeScene MCP tools are unavailable; text inspection used.
Validation uses Node 22.22.0/npm 10.9.9. Default Node 24/npm 11 is outside the repository requirement.
The sandbox adds a synthetic /tmp/.git mount, causing existing temp-safety tests to fail; the successful verification ran outside the sandbox.
The environment injects an experimental proxy warning into child stderr; suppress it with NODE_NO_WARNINGS=1 for empty-stderr assertions.

## Next action

Owner review of draft PR #106. Any later checkpoint-only commit is validated by the PR checks; the implementation-head evidence above remains commit-specific.

## Final local validation

`NODE_NO_WARNINGS=1 npm run ubs` passed outside the sandbox: toolchain, typecheck, ESLint, Markdown lint, workflow pins, and all 542 tests.
Independent review found no actionable defects. `git diff --check` passed.

## Tracking semantics

`work.json` retains the original intake status and next action by design; see `docs/agents/work-items.md`. This checkpoint owns execution state.
No human review feedback is outstanding; CodeRabbit skipped the draft.
