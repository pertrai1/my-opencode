# Angular skill improvements

Updated: 2026-11-11
Execution state: verified locally with environment limits; preparing draft PR

## Acceptance criteria

- [x] Version-aware API, testing, resource, SSR and component guidance.
- [x] Focused eval scenarios with honest verification limits.
- [ ] Open a draft PR, leaving final review to the user.

## Steps

- [x] Inspect main and PR #104; preserve that PR's live-fixture harness changes.
- [x] Verify primary Angular sources; update canonical skills/angular references.
- [x] Add 11 answer-quality scenarios and 3 offline wiring tests.
- [x] Independent read-only review; corrected defer-block dependency wording.
- [ ] Push and open a draft PR; inspect exact-head CI.

## Verification

- Node 22.23.3/npm 10.9.9; npm ci --ignore-scripts with workspace-local cache passed.
- npm run ubs: toolchain, TypeScript, ESLint, Markdown lint, workflow pins passed.
- Full suite: 538 tests, 527 passed, 11 unchanged PR-Agent tests failed because this executor's temporary storage is detected inside a Git checkout. Isolation guard was not weakened.
- node --test tests/angular-skill-guidance.test.mjs: 3/3 passed, rerun after final edits.
- Focused Angular/reference Markdown lint and git diff --check passed after final edits.
- TypeScript check does not cover new eval JavaScript. Offline tests check wiring, not response quality.
- No paid model eval, live OpenCode eval, or Angular runtime tests ran.
- Graph, Context7 and CodeScene tools unavailable. Primary Angular sources and text inspection used.

## Sources

- https://github.com/angular/angular/tree/main/skills/dev-skills/angular-developer
- Angular release-tag changelogs: 17.1.0, 17.2.0, 17.3.0, 19.0.0, 19.2.0.
- Official angular.dev resource, HTTP resource, SSR, queries, projection, defer and testing guides linked in the references.
- Upstream main has forward-looking APIs; no unreleased stability claim was imported.

## Blockers

- Full local suite has the environment-specific temporary-storage failures above.
- Paid/model-quality checks deliberately not run.

## Next action

Publish the scoped branch and draft PR, then inspect exact-head CI.
