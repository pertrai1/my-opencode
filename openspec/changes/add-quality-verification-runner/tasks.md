## 1. Runner Foundation

- [x] 1.1 Add the `quality` package script and a Node.js quality-verification entry point with parsed, validated `--check`, `--target`, `--test-arg`, and `--fallow-arg` options; verify invalid check names and unsupported arguments return an invocation error.
- [x] 1.2 Implement default Git working-tree discovery for staged, unstaged, and untracked JavaScript and TypeScript source files, including deduplication and clean-tree no-op behavior; verify with fixture repositories covering each source state.
- [x] 1.3 Define normalized per-check and overall JSON result types, threshold constants, terminal summary, and process-status handling; verify threshold failures and analyzer errors remain distinguishable.

## 2. Quality Check Adapters

- [x] 2.1 Add ephemeral Fallow adapters for cyclomatic complexity, cognitive complexity, CRAP, dead code, and duplicate code using JSON output, `npx --yes`, `--no-cache`, and change-scoped finding attribution; verify the invoked command, strict thresholds, and parsed pass/fail results with subprocess fixtures.
- [x] 2.2 Add ESLint-backed file-length verification and TypeScript AST inspection for explicit `any` and `unknown` types while preserving existing ESLint and `eslint-plugin-llm-core` configuration; verify a fixture source file fails each threshold.
- [x] 2.3 Reuse the existing zero-install Halstead analyzer, implement its changed-file adapter with the below-80 difficulty threshold, and verify a target source file produces a normalized pass or fail result.
- [x] 2.4 Integrate the repository test command and coverage artifact parsing so line, branch, function, and statement coverage are enforced at 100 percent for changed source files; verify selected-test arguments are forwarded and insufficient coverage fails.

## 3. Reporting And Safety

- [x] 3.1 Create timestamped quality reports under `.agents/reports/quality-report-<TIMESTAMP>.json` for successful, failed, and analyzer-error runs; verify each report includes invocation, target root, source inventory, selected checks, per-check results, failures, and overall status.
- [x] 3.2 Ensure temporary Fallow inputs and analyzer artifacts are stored outside the target repository and cleaned after execution; verify a Fallow-backed run in a fixture repository does not create `.fallow`.

## 4. Documentation And Integration Verification

- [x] 4.1 Document the quality command, all check identifiers, scoped default behavior, analyzer-specific arguments, report location, and the initial exclusion of mutation testing; verify examples match the implemented CLI help output.
- [x] 4.2 Add focused Node test coverage for argument parsing, Git scope discovery, check selection, adapter normalization, report-on-failure behavior, and the `.fallow` non-creation guarantee; verify with `npm test`.
- [x] 4.3 Run `npm run typecheck`, `npm run lint`, `npm test`, and the full quality command against this repository; verify the resulting report is valid JSON and record any environment-dependent checks that cannot run.
