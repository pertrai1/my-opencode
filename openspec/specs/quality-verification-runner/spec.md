# Quality Verification Runner Specification

## Purpose

Provide a repeatable, machine-readable quality gate for JavaScript and TypeScript changes that developers, CI, and LLM sessions can run without permanently installing Fallow.

## Requirements

### Requirement: Change-scoped quality verification
The quality-verification runner SHALL evaluate the full enabled quality suite when no individual check is selected. By default, its input scope SHALL include staged and unstaged tracked changes and untracked source files in the current Git working tree.

The full suite SHALL evaluate cyclomatic complexity, cognitive complexity, Halstead difficulty, file line count, test coverage, CRAP score, dead code, duplicate code, and explicit `any` or `unknown` TypeScript types. Mutation testing SHALL NOT be part of the initial suite.

#### Scenario: Run the default suite with working-tree changes
- **WHEN** a caller runs the quality-verification runner without selecting checks
- **THEN** the runner evaluates every enabled initial-suite check against the working-tree change scope

#### Scenario: Run against a clean working tree
- **WHEN** a caller runs the quality-verification runner with no staged, unstaged, or untracked source files
- **THEN** the runner reports that no changed source files are available for change-scoped analysis and completes without treating the absent scope as a quality violation

### Requirement: Selectable checks and CLI arguments
The quality-verification runner SHALL allow callers to select one or more individual quality checks instead of the full suite. It SHALL accept caller-provided CLI arguments needed to control its scope or forward supported options to its underlying analyzers.

#### Scenario: Run one selected check
- **WHEN** a caller selects only the dead-code check
- **THEN** the runner executes the dead-code analysis and does not execute unselected checks

#### Scenario: Run multiple selected checks with arguments
- **WHEN** a caller selects multiple checks and supplies supported CLI arguments
- **THEN** the runner applies the arguments to the selected run and identifies unsupported arguments as an invocation error

#### Scenario: Reject an unsupported Fallow argument
- **WHEN** a caller supplies an unsupported value through `--fallow-arg`
- **THEN** the runner returns an invocation error before executing Fallow

#### Scenario: Reject an unsupported test argument
- **WHEN** a caller supplies an unsupported flag through `--test-arg`
- **THEN** the runner returns an invocation error before executing the test command

### Requirement: Enforced quality thresholds
The runner SHALL mark a selected check as failed when its result does not meet the configured threshold: cyclomatic complexity below 22, cognitive complexity below 22, Halstead difficulty below 80, fewer than 500 lines per file, 100 percent test coverage, CRAP below 25, zero dead-code findings, zero redundant-code findings, and zero explicit `any` or `unknown` type findings.

#### Scenario: A threshold is exceeded
- **WHEN** a selected check reports a value outside its required threshold
- **THEN** the runner records the check as failed and returns a failing process result after producing its report

#### Scenario: All selected checks meet their thresholds
- **WHEN** every selected check meets its threshold
- **THEN** the runner records each check as passed and returns a successful process result

### Requirement: Timestamped quality report
Every quality-verification run SHALL create a JSON report at `.agents/reports/quality-report-<TIMESTAMP>.json` in the target working repository, including selected checks, effective scope, per-check results, failures, and the overall result. The runner SHALL write the report when an executed check fails.

#### Scenario: Failed verification creates evidence
- **WHEN** an executed quality check fails
- **THEN** the runner writes a timestamped JSON report containing that failure before returning a failing process result

#### Scenario: Successful verification creates evidence
- **WHEN** all selected quality checks pass
- **THEN** the runner writes a timestamped JSON report containing the passing results

### Requirement: Ephemeral Fallow analysis
The runner SHALL execute Fallow through `npx` without requiring Fallow to be declared as a dependency of the target repository. It SHALL configure or invoke Fallow so that it does not create a `.fallow` directory in the target working repository.

#### Scenario: Run Fallow in a repository without Fallow installed
- **WHEN** a selected quality check requires Fallow and the target repository does not declare Fallow as a dependency
- **THEN** the runner invokes Fallow through `npx` and records its analysis result

#### Scenario: Fallow execution leaves no repository cache directory
- **WHEN** the runner completes a Fallow-backed quality check
- **THEN** no `.fallow` directory has been created in the target working repository by that run

### Requirement: Production-source applicability
The quality-verification runner SHALL apply complexity, Halstead, coverage, CRAP, dead-code, and duplicate-code checks to changed production source files. It SHALL exclude conventional test files and test directories from those checks. It SHALL recognize target `package.json` script references to Node CLI source files as intentional entrypoints rather than dead code.

#### Scenario: Changed test file
- **WHEN** the changed scope contains a conventional test file or a file beneath a test directory
- **THEN** the runner excludes that file from production-source analyzer checks without classifying it as a quality failure

#### Scenario: Declared CLI entrypoint
- **WHEN** a changed source file is referenced by a target package script as a Node CLI entrypoint
- **THEN** the dead-code check does not report that file as unused solely because it has no module importer

### Requirement: Unsupported Halstead syntax
The runner SHALL distinguish an unsupported Halstead analyzer syntax mode from a code-quality failure. When the configured Halstead analyzer cannot parse an otherwise valid ESM source file, the runner SHALL record the result as `skipped` with an unsupported-tooling diagnostic and SHALL not fail the overall quality result solely for that condition.

#### Scenario: ESM source unsupported by Halstead analyzer
- **WHEN** Halstead analysis cannot parse a changed `.mjs` source file because the analyzer does not support ESM syntax
- **THEN** the runner records a skipped Halstead result identifying the unsupported syntax and continues the remaining quality checks
