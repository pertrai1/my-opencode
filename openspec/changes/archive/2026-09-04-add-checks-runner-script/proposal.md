## Why

Verification-oriented agents (`verify`, `change-verifier`, `sdlc-orchestrator`) currently re-derive "run the relevant automated checks (tests, linters, types)" from scratch, in prose, every time they operate in a target repository. Unlike the existing `quality-verification.mjs` and `halstead-analyzer.js` scripts — which are target-repo-agnostic, fail-fast, and produce durable evidence under `.agents/reports/` in the repo being worked on — there is no equivalent script for the basic typecheck/lint/test gate. This causes agents to improvise which commands constitute "automated checks" per invocation, produces inconsistent evidence, and loses results once an agent's context window moves on or a different agent/session needs to consume them.

## What Changes

- Add `scripts/checks-runner.mjs`, following the same reusable-tooling convention as `quality-verification.mjs` and `halstead-analyzer.js`: invoked via absolute path (`node ~/.config/opencode/scripts/checks-runner.mjs`), operating against the current working directory as the target repository (not this config repo), with no assumption that the target repo is this repo.
- The runner auto-detects the target repo's own toolchain (starting with Node/`package.json` scripts named `typecheck`, `lint`, and `test`) and runs each as a distinct, named stage in fail-fast order (cheapest/fastest first).
- Each run writes a timestamped, structured report into the *target* repo at `.agents/reports/checks-<TIMESTAMP>.json` (machine-readable: per-stage command, exit code, condensed output, overall result) and `.agents/reports/checks-<TIMESTAMP>.md` (human-readable summary), mirroring the existing `quality-report-<TIMESTAMP>` convention.
- Add `commands/checks.md` (slash command) so the runner can be invoked directly, following the pattern of `commands/quality.md` and `commands/halstead.md`.
- Update `agents/verify` and `agents/change-verifier` (and `sdlc-orchestrator` where it currently improvises this step) to run the checks-runner and cite its generated report as the evidence source for their "Automated Checks" sections, instead of independently deciding which commands to run.

## Capabilities

### New Capabilities
- `checks-runner`: Target-repo-agnostic script and slash command that detects and runs a target repository's own typecheck/lint/test commands in fail-fast order and persists a timestamped, structured report of the results for consumption by other agents or sessions.

### Modified Capabilities
- `quality-verification-runner`: Apply production-source applicability rules so test files and declared CLI entrypoints are not misreported as coverage/dead-code failures, and report unsupported ESM Halstead analysis as tooling status rather than a code defect.

## Impact

- New file: `scripts/checks-runner.mjs`.
- New file: `commands/checks.md`.
- Modified: `agents/verify.md` (if present) or `commands/verify.md`, `agents/change-verifier.md`, `agents/sdlc-orchestrator.md` — updated to reference the new runner instead of ad hoc check instructions.
- New per-run artifacts land in whatever target repository an agent is working in, at `.agents/reports/checks-<TIMESTAMP>.{json,md}` — same location/gitignore convention already established by the quality-verification runner, no changes needed to a target repo's own `.gitignore` since `.agents/reports/` is already the established convention for this config repo and recommended for target repos.
- No changes to CI (`.github/workflows/ci.yml`) or this config repo's own git hooks (`.husky/pre-commit`), since this tooling targets arbitrary repositories an agent works in, not this config repo's own housekeeping.
