# sdlc-orchestrator Specification

## Purpose
Defines an end-to-end change orchestration capability that lets one primary agent manage OpenSpec workflow progression, delegate SDLC roles to specialized subagents, and produce persisted verification summaries for a human approver.

## Requirements

### Requirement: Orchestrator owns change lifecycle control
The system MUST provide a primary SDLC orchestrator agent that is the workflow authority for an OpenSpec change from intake through archive readiness.

#### Scenario: Start a new change from a user request
- **WHEN** a user asks to begin a new change
- **THEN** the orchestrator SHALL select the planning scope, create the change through the OpenSpec CLI, inspect artifact status, and guide the change through the schema-defined artifact sequence

#### Scenario: Continue an existing change
- **WHEN** a user asks to continue a named or inferred change
- **THEN** the orchestrator SHALL inspect the change status through the OpenSpec CLI and choose the next allowed planning, implementation, verification, or archive action based on the reported workflow state

### Requirement: Orchestrator owns OpenSpec CLI workflow actions
The system MUST centralize OpenSpec workflow commands in the SDLC orchestrator so that planning and lifecycle transitions are decided in one place.

#### Scenario: Request requires change status or artifact instructions
- **WHEN** the orchestrator needs workflow state to decide what happens next
- **THEN** it SHALL run the relevant OpenSpec CLI command itself and SHALL use the returned status, instructions, and resolved paths as the source of truth

#### Scenario: Subagent participates in planning or delivery
- **WHEN** a subagent is used for a planning, implementation, verification, or review role
- **THEN** the orchestrator SHALL pass scoped instructions and the subagent SHALL NOT need to run OpenSpec workflow commands to decide what artifact or phase comes next

### Requirement: Planning uses high-reasoning authoring roles
The system MUST front-load reasoning into planning artifacts so that proposal, specs, design, and tasks are authored by planning-focused agents with stronger reasoning than the implementation agents.

#### Scenario: Planning artifacts are created for a change
- **WHEN** the orchestrator delegates proposal, spec, design, or task authoring
- **THEN** it SHALL use planning-focused authoring roles that are expected to resolve ambiguity, define behavioral requirements, and produce execution-ready work breakdowns

#### Scenario: Planning is incomplete or ambiguous
- **WHEN** the orchestrator determines that a planning artifact leaves material ambiguity that would change requirements, design, or task breakdown
- **THEN** it SHALL pause progression into implementation and surface the ambiguity for resolution instead of pushing the decision into lower-reasoning implementation roles

### Requirement: Implementation uses constrained delegated roles
The system MUST support delegated implementation roles with narrower responsibilities and lower required reasoning than the planning authors, while preserving verification and workflow control at the orchestrator level.

#### Scenario: Behavioral implementation begins
- **WHEN** the orchestrator starts implementation for a behavioral task
- **THEN** it SHALL delegate through a constrained implementation workflow that separates planning from execution and validates the resulting work against the planned behavior

#### Scenario: Execution discovers planning drift
- **WHEN** an implementation or verification step reveals a mismatch with the proposal, specs, design, or tasks
- **THEN** the orchestrator SHALL stop the current execution path, classify the drift, and route the change back through the appropriate planning artifact before continuing

### Requirement: Orchestrator discovers the active target repository and evidence before command selection
Before selecting lifecycle delegation, verifier mode, or package manager, the orchestrator MUST discover the active target repository and load repository-specific evidence from that repository.

#### Scenario: Target repository discovery on startup
- **WHEN** orchestrator flow starts in this harness
- **THEN** it SHALL identify the selected active workspace and resolve repository evidence from that workspace path before issuing any target-facing verification commands
- **AND** it SHALL continue only when repository evidence can be collected from the active workspace.

#### Scenario: Evidence scan ordering before planning execution
- **WHEN** the orchestrator prepares for planning or implementation delegation
- **THEN** it SHALL check, in precedence order, for: 
  1. `AGENTS.md` guidance for command authority and environment expectations
  2. `README*` files for repository-level norms and scripts
  3. `CONTEXT.md` or `CONTEXT-MAP.md` for domain constraints
  4. Relevant ADRs under local `docs/adr*` or repository-specific ADR locations
  5. Package-manager lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`)
  6. `package.json` scripts
  7. TypeScript/JavaScript config files (`tsconfig*`, `jsconfig*`, Babel/ESM config when present)
  8. Test/lint/test-runner configuration files
  9. Existing test files
  10. Public exports / entry points from package manifests and index modules
- **THEN** it SHALL record the evidence used and any missing evidence in its coordination notes before choosing commands.

#### Scenario: Discovery is scoped to target repository
- **WHEN** discovery is performed for command selection
- **THEN** the orchestrator SHALL use the target repository evidence (not harness defaults) to determine valid scripts, paths, and verification commands.

### Requirement: Verification produces a persisted human summary
The system MUST produce a persisted verification summary for each change so a human reviewer can inspect what was done, what evidence was checked, and what remains open before approval or archive.

#### Scenario: Verification completes for a change
- **WHEN** the orchestrator finishes a verification pass
- **THEN** it SHALL ensure a change-local summary artifact is written that records completed work, evidence checked, material verification actions intentionally not taken, notable file or area changes, unresolved issues, and an archive-readiness recommendation

#### Scenario: Human reviews a completed verification pass
- **WHEN** a human returns to review a change after agent activity
- **THEN** the workflow SHALL provide a persisted summary artifact inside the change that can be read without reconstructing the session from raw tool output

### Requirement: Portable verifier and command selection
The orchestrator MUST choose typecheck and verification commands by project evidence and package manager, not harness conventions.

#### Scenario: TypeScript project typechecking
- **WHEN** the target workspace has TypeScript configuration (`tsconfig*.json` or `tsconfig`-related files)
- **THEN** the orchestrator SHALL prefer repository-declared typecheck command from `package.json` scripts when present
- **ELSE** it SHALL run `tsc --noEmit` in the target workspace.

#### Scenario: JavaScript project with checkJs
- **WHEN** the target workspace has no TypeScript project config but uses JavaScript with `checkJs` support
- **THEN** the orchestrator SHALL use `tsc --checkJs` as the typechecking strategy.

#### Scenario: Plain JavaScript with no viable typechecker
- **WHEN** the target workspace has no TypeScript config, no `checkJs` strategy, and no supported typechecking command
- **THEN** the orchestrator SHALL require explicit `no-contract mode` and identify a trusted public API source-of-truth before delegating RED tests.
- **AND** RED delegation MUST be based on the exact test-facing signature discovered from that public source evidence, not inferred implementation internals.
- **AND** implementation SHALL proceed via a two-phase RED → GREEN behavioral loop with RED tests, then GREEN implementation, and SHALL NOT be downgraded to documentation-only work.

#### Scenario: Package-manager aware command selection
- **WHEN** invoking project-defined scripts for testing, linting, or validation
- **THEN** the orchestrator SHALL detect and use the workspace package manager lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`) and invoke commands with that tool
- **AND** it SHALL avoid assuming npm if another package manager is authoritative in the discovered target repository.

### Requirement: Archive requires orchestrator-mediated approval readiness
The system MUST treat archive as an orchestrator-controlled lifecycle step that is allowed only after planning, implementation, and verification conditions are satisfied or explicitly accepted.

#### Scenario: Change is ready to archive
- **WHEN** the orchestrator determines that required work is complete and verification has produced a persisted summary
- **THEN** it SHALL present the archive readiness state and supporting summary to the human before archive proceeds

#### Scenario: Change is not ready to archive
- **WHEN** required artifacts are incomplete, implementation is unfinished, or verification finds blocking issues
- **THEN** the orchestrator SHALL prevent archive progression and report what remains unresolved
