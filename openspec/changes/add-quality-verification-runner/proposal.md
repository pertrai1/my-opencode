## Why

The repository has linting and test commands but no single, consistent way to assess the agreed code-quality thresholds for only the work currently being changed. A report-oriented runner makes those checks usable by developers, CI, and LLM sessions without requiring Fallow to be installed in each target repository.

## What Changes

- Add a Node.js quality-verification runner that evaluates selected quality checks or the full suite and reports a pass/fail result.
- Default analysis to staged and unstaged tracked changes plus untracked source files, while allowing callers to pass additional CLI arguments through to the underlying tools.
- Run Fallow through `npx` without a project installation and configure its execution to avoid repository-local `.fallow` artifacts where possible.
- Combine Fallow findings with ESLint and `eslint-plugin-llm-core` results for the supported complexity, dead-code, duplication, line-count, and type-policy checks.
- Persist a timestamped machine-readable report under `.agents/reports/quality-report-<TIMESTAMP>.json`.
- Exclude mutation testing from the initial runner.

## Capabilities

### New Capabilities
- `quality-verification-runner`: Run selected code-quality gates against a change-scoped JavaScript or TypeScript workspace and create a machine-readable quality report.

### Modified Capabilities

None.

## Impact

- New Node.js runner, supporting configuration, and focused tests.
- Package scripts and development dependencies may be updated to invoke the runner and provide its analyzers.
- Target repositories gain a generated report in `.agents/reports/`; the runner must not require Fallow installation or leave a `.fallow` directory in the working repository.
