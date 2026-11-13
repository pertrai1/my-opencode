# Progress: portable Git fixture isolation checks

Execution state: implemented and validated; awaiting draft PR publication.

## Acceptance criteria and checklist

- [x] Reproduce the canonical-path mismatch with a symlinked temporary root.
- [x] Compare real paths instead of requiring identical spelling from Git.
- [x] Exercise both direct and symlinked roots without skipping either case.
- [x] Preserve hook-environment isolation, parent index/ref invariance, and the
  marker proving the nested test executed.
- [x] Focused tests: 2 passed. `npm run ubs`: all stages passed, 554 tests.
- [x] Independent read-only review found no material issues.
- [ ] Open one draft PR and verify exact-head CI. Owner retains merging.

## Evidence

PRs #108, #109, and #110 reported a macOS `/var` versus `/private/var`
failure in this test. A symlinked-root case reproduces it on Linux: before the
fix, the direct case passed and the symlink case failed the root comparison.
Only test assertions/fixtures change; no runtime behavior or permission changes.
The separate macOS invalid-UTF8 filename tests are out of scope.

## Limits

Node 22.23.3 / npm 10.9.9. Full checks ran outside the synthetic sandbox Git
mount, with injected proxy warnings suppressed via `NODE_NO_WARNINGS=1`.
No repository checks bypassed.

No macOS executor used. Linux symlink coverage models path aliasing, not a full
macOS validation. Code graph and CodeScene unavailable; text review used.

## Next action

Run aggregate validation and publish only after checking for concurrent work.
