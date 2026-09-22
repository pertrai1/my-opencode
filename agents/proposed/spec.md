# Checks Runner Specification

## Purpose

Provide OpenCode agents and other harnesses with a repeatable target-repository check gate that runs repository-defined checks consistently and preserves reusable evidence for later agents and sessions.

## Requirements

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


