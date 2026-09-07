# sdlc-orchestrator Specification Delta: Oracle and Do-Nothing Verifiers

## ADDED Requirements

### Requirement: Baseline sensitivity (Do-Nothing Verifier)
The system MUST require that newly authored functional or integration verification checks demonstrate failure against the pre-change baseline (e.g. `git merge-base` or unmodified workspace) before they are accepted as proof of work.

#### Scenario: Verification check passes on clean baseline
- **WHEN** a new verification check or smoke test is executed against the pre-change baseline code
- **AND** the check passes before any changes are applied
- **THEN** the verifier SHALL flag the check as vacuous/tautological and SHALL NOT treat it as valid proof of the requested change.

#### Scenario: Verification check fails on clean baseline and passes on changed workspace
- **WHEN** a new verification check fails against the unmodified baseline and passes against the modified workspace
- **THEN** the verifier SHALL record both the negative baseline evidence and the positive verified outcome in `verification.md`.

### Requirement: Baseline oracle preflight check
The orchestrator MUST capture a clean baseline run of repository checks before delegating Phase 0 / Phase 1 implementation.

#### Scenario: Baseline checks fail before implementation begins
- **WHEN** the orchestrator runs the project verification command on a clean workspace prior to task execution
- **AND** preexisting failures are detected
- **THEN** it SHALL record those preexisting failures as baseline oracle context in `progress.md` so they are not misattributed to the current task.
