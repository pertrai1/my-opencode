## ADDED Requirements

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
