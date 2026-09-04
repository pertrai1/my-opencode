## Context

See `proposal.md` for motivation and `specs/quality-verification-runner/spec.md` for the behavior contract. The repository is a Node.js configuration project with ESLint, `eslint-plugin-llm-core`, TypeScript, and Node's built-in test runner already available. Fallow supplies project-graph checks but is intentionally not a repository dependency.

## Goals / Non-Goals

**Goals:**

- Provide one Node.js command that selects checks, determines the default working-tree source scope, invokes analyzers, and writes a stable JSON evidence artifact.
- Keep Fallow execution ephemeral and avoid creating `.fallow` in the target repository.
- Make analyzer failures, unsupported arguments, and threshold failures distinguishable in the report and process status.

**Non-Goals:**

- Add mutation testing or install Stryker.
- Reimplement Fallow's graph, complexity, dead-code, duplicate-code, or CRAP calculations.
- Treat 100 percent coverage as proof of test quality.
- Make a changed-file filter turn a project-graph dead-code finding into a claim that the rest of the repository has no dead code.

## Decisions

### One orchestrator with named checks

Add an executable Node.js module under `scripts/` and expose it through a package script. It will own argument parsing, Git scope discovery, subprocess execution, result normalization, report creation, terminal summary, and final exit status.

The public interface will use repeatable named checks:

```text
npm run quality -- [--check <name> ...] [--target <path> ...] [--test-arg <arg> ...] [--fallow-arg <arg> ...]
```

With no `--check`, the runner selects the complete initial suite. Check names are stable identifiers such as `cyclomatic`, `cognitive`, `halstead`, `loc`, `coverage`, `crap`, `dead-code`, `duplicates`, and `types`. `--target` replaces default Git discovery. Analyzer-specific arguments are explicit, repeatable options rather than an unrestricted trailing argument list, preventing an option intended for one analyzer from silently affecting another.

Alternative considered: a single free-form pass-through section. Rejected because it cannot validate ownership, record effective configuration reliably, or reject unsupported arguments as the specification requires.

### Working-tree scope is a normalized file inventory

The runner will merge staged and unstaged `git diff --name-only` results with untracked files from Git, deduplicate paths, normalize them relative to the target repository, and retain only supported JavaScript and TypeScript source extensions. It will record the complete inventory in the JSON report.

File-local checks operate directly on this inventory. Project-graph tools still analyze the project as required for correctness, then the runner attributes source-anchored findings to the inventory. This preserves Fallow's ability to understand imports while making the default output focused on current work. A clean inventory creates a successful no-op report rather than launching analyzers with an empty target set.

Alternative considered: use only `--changed-since`. Rejected because it does not cover unstaged or untracked work and needs a Git ref rather than the requested working-tree default.

### Tool ownership remains narrow

Fallow is run with `npx --yes fallow`, JSON output, the target repository as its root, and `--no-cache`. `--no-cache` prevents Fallow's incremental cache from creating `.fallow`; temporary diffs and parsed output are kept in the operating-system temporary directory and removed after the run. Fallow provides cyclomatic complexity, cognitive complexity, CRAP, dead-code, and duplicate-code evidence.

ESLint runs against the normalized target files for file length and explicit type-policy findings, while preserving the repository's ESLint configuration and its `eslint-plugin-llm-core` rules. The runner will add focused ESLint rules/configuration for `max-lines` and the prohibition of explicit `any` and `unknown` types where they are not already present.

Halstead difficulty requires a dedicated JavaScript/TypeScript metrics analyzer, selected and invoked by the runner rather than inferred from Fallow. Coverage is collected through the repository's configured test command, with coverage data normalized to the changed source inventory before enforcing all four coverage dimensions. The test command receives repeatable `--test-arg` values so callers can select individual tests.

Alternative considered: add a broad all-in-one quality platform. Rejected because the requested checks already map cleanly to Fallow, ESLint, and narrow supplemental analyzers, and a broad platform would duplicate the existing lint/test setup.

### Threshold evaluation is centralized

Each adapter returns a normalized result containing its check identifier, status (`pass`, `fail`, `error`, or `skipped`), configured threshold, measured value or finding count, affected paths, and diagnostic output. The orchestrator evaluates strict limits as `21` for complexity and `24` for CRAP when forwarding Fallow thresholds, so findings at 22 and 25 fail the requested strictly-less-than rules. It evaluates the remaining limits directly from adapter output.

An analyzer execution error differs from a quality failure: both make the overall command fail, but the report identifies errors so an LLM or CI job can decide whether to fix code or repair the verification environment.

### Reports are durable and collision-resistant

At the start of each run, the runner creates `.agents/reports/` relative to the target repository and reserves `quality-report-<ISO-safe-timestamp>.json`. It writes the report in a `finally` path after argument validation succeeds, including failures and analyzer errors. The report contains schema version, invocation, target root, source inventory, selected checks, per-check normalized results, overall status, and report timestamp. If report-directory creation or report writing fails, the runner returns an execution error because the evidence contract cannot be met.

Alternative considered: print JSON only to standard output. Rejected because the required artifact must survive terminal/LLM context loss and CI log truncation.

## Risks / Trade-offs

- [Fallow cache behavior varies by version] -> Pass `--no-cache`, test that the target repository has no new `.fallow` directory, and report an analyzer error if the supported invocation is rejected.
- [Static dead-code and duplicate-code analysis can have framework or dynamic-import false positives] -> Preserve Fallow JSON diagnostics and permit Fallow configuration/suppressions maintained by the target repository; do not hide findings in the runner.
- [Coverage collection may be slow or framework-specific] -> Reuse the repository's test command and support test-selection arguments; record unavailable coverage as an error rather than a passing result.
- [A type-policy ban on `unknown` can reject otherwise safe boundary handling] -> Enforce the requested policy explicitly and require code to use approved concrete types or a future policy exception mechanism.
- [A one-file change can require whole-project graph analysis] -> Scope displayed findings to changed paths while documenting the graph-analysis boundary in the report.

## Migration Plan

1. Add the runner, its supporting configuration, and focused tests without changing existing lint or test commands.
2. Add an opt-in package script and document the named checks and report location.
3. Run the full suite against this repository to establish analyzer compatibility and adjust only repository-owned configuration needed for the declared thresholds.
4. Adopt the package script in CI after the runner and report contract are verified. Rollback is removal of the new script/configuration; existing `lint`, `typecheck`, and `test` commands remain independent.
