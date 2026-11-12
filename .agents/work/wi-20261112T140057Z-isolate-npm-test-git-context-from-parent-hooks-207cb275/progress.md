# Git test isolation

## Acceptance criteria

- npm test clears repository-local Git variables before test code loads.
- Contaminated test fixtures do not change parent index or refs.
- Existing tests and verification remain passing.

## Checklist

- [x] Inspect current main, hooks, UBS, fixtures and open PRs (none).
- [x] Reproduce parent index mutation in disposable repositories, not a real checkout.
- [x] Add preload using Git's own local environment variable list and regression.
- [x] Run full verification and independent review.
- [ ] Draft PR and exact-head CI.

## Evidence

Regression failed before fix with both parent index and branch ref changes, passed afterward.
The regression models hook-exported variables using disposable repositories; it does not claim a real hook end-to-end test.
Graph and CodeScene MCP tools are unavailable; text inspection used.
Validation uses Node 22.22.0/npm 10.9.9. Default Node 24/npm 11 is outside the repository requirement.
The sandbox adds a synthetic /tmp/.git mount, causing existing temp-safety tests to fail; rerun outside the sandbox.
The environment injects an experimental proxy warning into child stderr; suppress it with NODE_NO_WARNINGS=1 for empty-stderr assertions.

## Next action

Open the draft PR and verify CI for its exact head.

## Final local validation

`NODE_NO_WARNINGS=1 npm run ubs` passed outside the sandbox: toolchain, typecheck, ESLint, Markdown lint, workflow pins, and all 542 tests.
Independent review found no actionable defects. `git diff --check` passed.
