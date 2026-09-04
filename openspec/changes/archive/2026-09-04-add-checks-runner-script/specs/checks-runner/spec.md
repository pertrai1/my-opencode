## Purpose

Provide OpenCode agents and other harnesses with a repeatable target-repository check gate that runs repository-defined checks consistently and preserves reusable evidence for later agents and sessions.

## ADDED Requirements

### Requirement: Target repository isolation
The checks runner SHALL operate on the active target repository rather than assuming that the OpenCode configuration repository is the project under test. It SHALL use the current working directory by default and SHALL accept an explicit target directory. Check discovery, command execution, and report output SHALL be resolved against that target directory.

#### Scenario: Run from an active target repository
- **WHEN** a caller invokes the runner without an explicit target directory
- **THEN** the runner discovers checks in the current working directory and writes reports beneath that directory

#### Scenario: Run with an explicit target directory
- **WHEN** a caller supplies a valid target directory
- **THEN** the runner discovers and executes checks in that directory without using the OpenCode configuration repository's project scripts

#### Scenario: Reject an invalid target directory
- **WHEN** a caller supplies a path that is missing or is not a directory
- **THEN** the runner reports an invocation error and does not execute a check stage

### Requirement: Repository-defined check discovery
The runner SHALL initially support Node repositories by discovering `typecheck`, `lint`, and `test` scripts declared in the target repository's `package.json`. It SHALL use the target repository's declared or unambiguously detected package manager, SHALL classify an absent standard script as `not-configured` rather than passed, and SHALL NOT install dependencies or modify target project configuration during discovery.

#### Scenario: Discover all standard Node checks
- **WHEN** the target repository declares `typecheck`, `lint`, and `test` scripts
- **THEN** the runner selects all three repository-defined scripts and records the package manager used to invoke them

#### Scenario: Discover a subset of standard checks
- **WHEN** the target repository declares only some of the standard scripts
- **THEN** the runner selects the declared scripts and records each absent standard script as `not-configured`

#### Scenario: No supported checks are configured
- **WHEN** the target repository has no supported repository-defined check scripts
- **THEN** the runner records a blocked result, writes the available reports after resolving the target, and exits unsuccessfully without presenting the repository as verified

#### Scenario: Package manager cannot be selected safely
- **WHEN** target metadata does not permit an unambiguous supported package-manager selection
- **THEN** the runner records a setup error and does not guess or execute a check command

### Requirement: Deterministic fail-fast execution
The runner SHALL execute configured stages in the order `typecheck`, `lint`, then `test`, skipping stages that are not configured. It SHALL stop after the first failed or errored stage and SHALL record later configured stages as `not-run`. Check commands SHALL run noninteractively so that a watch process cannot leave an agent invocation waiting indefinitely.

#### Scenario: All configured checks pass
- **WHEN** every configured stage exits successfully
- **THEN** the runner records every executed stage as passed and exits successfully

#### Scenario: A check fails
- **WHEN** a configured stage exits unsuccessfully
- **THEN** the runner records that stage's failure, does not execute any later configured stage, writes the reports, and exits unsuccessfully

#### Scenario: An early standard stage is not configured
- **WHEN** `typecheck` is absent but `lint` and `test` are configured
- **THEN** the runner records `typecheck` as `not-configured` and continues with `lint` followed by `test`

### Requirement: Timestamped paired reports
After resolving a valid target repository, every runner invocation SHALL create a uniquely named JSON report and Markdown report in the target repository at `.agents/reports/checks-<TIMESTAMP>.json` and `.agents/reports/checks-<TIMESTAMP>.md`. Both files SHALL identify the same run, and the runner SHALL print their paths before exiting. Reports SHALL be written for successful, failed, blocked, and setup-error outcomes whenever the target report directory is writable.

#### Scenario: Successful run preserves evidence
- **WHEN** all configured checks pass
- **THEN** the runner writes the paired reports with a successful overall outcome before returning success

#### Scenario: Failed run preserves evidence
- **WHEN** a check fails
- **THEN** the runner writes the paired reports with the failed stage and unsuccessful overall outcome before returning failure

#### Scenario: Concurrent runs use distinct artifact names
- **WHEN** two runs complete within the same wall-clock second
- **THEN** each run writes a distinct report pair without overwriting the other run's evidence

#### Scenario: Report persistence fails
- **WHEN** the target report directory cannot be created or a required report cannot be written
- **THEN** the runner emits a fallback summary to the terminal, identifies report persistence as an error, and exits unsuccessfully

### Requirement: Machine-readable and human-readable evidence
The JSON report SHALL have a schema version and SHALL include the run identity, invocation, timestamps, target root, detected toolchain and package manager, repository-state metadata when available, each standard stage's status, each executed command and working directory, exit code, duration, condensed diagnostic output, and overall outcome. The Markdown report SHALL present the same decisive evidence in a concise human-readable form. If captured output is truncated, the reports SHALL state that truncation occurred; persisted diagnostic output SHALL redact recognizable secrets before writing.

#### Scenario: Another harness reads a passing report
- **WHEN** a harness reads the JSON report from a successful run
- **THEN** it can determine what repository state was checked, which commands ran, their results, and whether any standard stages were not configured without parsing terminal formatting

#### Scenario: Failure output is large
- **WHEN** a failed command produces more output than the report retention limit
- **THEN** the report preserves bounded diagnostic context and explicitly records that output was truncated

#### Scenario: Diagnostic output contains a recognizable secret
- **WHEN** captured command output contains a supported secret pattern
- **THEN** the persisted reports replace the secret value with a redaction marker

#### Scenario: Target is not a Git worktree
- **WHEN** checks run in a valid non-Git target directory
- **THEN** the reports mark Git repository-state metadata as unavailable without treating that absence as a check failure

### Requirement: Unambiguous outcome semantics
The runner SHALL return success only when at least one supported check was configured, every executed check passed, and both required reports were persisted. It SHALL distinguish check failure, blocked discovery, setup error, and report error in its structured outcome rather than presenting every non-zero result as a code defect.

#### Scenario: Partial check configuration passes
- **WHEN** at least one supported check is configured and all configured checks pass
- **THEN** the runner exits successfully while retaining `not-configured` statuses for absent standard stages

#### Scenario: Tool failure is not reported as a failed code check
- **WHEN** the runner cannot start a configured command or persist its reports
- **THEN** it identifies the outcome as a runner or setup error rather than claiming that repository code failed the check

### Requirement: OpenCode harness integration
The OpenCode checks command and verification-oriented agents SHALL invoke the shared runner from the active target worktree, report its exact invocation and exit status, and cite the generated report paths. A consuming agent or harness MAY use a prior report as durable memory, but SHALL treat it as historical evidence and SHALL NOT claim it verifies the current workspace when the report's recorded repository state no longer matches the target repository.

#### Scenario: Invoke checks through OpenCode
- **WHEN** a user runs the checks command in a target repository
- **THEN** OpenCode invokes the shared runner, reads the generated evidence, and summarizes the outcome and report paths

#### Scenario: Verification agent consumes current-run evidence
- **WHEN** a verification-oriented agent runs automated checks
- **THEN** it uses the report produced by that invocation as the evidence source for commands, statuses, and condensed results

#### Scenario: A later agent finds a stale report
- **WHEN** a later agent finds a prior report whose recorded repository state does not match the current target workspace
- **THEN** it labels the report as historical or stale and reruns checks before claiming current verification
