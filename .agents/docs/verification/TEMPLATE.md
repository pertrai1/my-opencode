# Verification Report: <source>

## Metadata

- Source of truth: <issue URL, issue number, OpenSpec change, or file path>
- Target repository: `<absolute path>`
- Verification timestamp (UTC): `<YYYY-MM-DDTHH:MM:SSZ>`
- Current revision: `<git SHA>`
- Base branch and revision: `<branch>` / `<git SHA>`
- Verification artifact: `<artifact path>`
- Linked GitHub Issue: `<issue URL or None>`
- Changed files: `<complete list, including staged, unstaged, and untracked files>`

## Source and Scope Identification

Describe how the source of truth was resolved, including candidates considered and
why the selected source won. State the commits, files, directories, and task
scope included in verification.

## Work Summary

Summarize what changed, which requirements the changes address, the intended
behavioral effect, what was deliberately left unchanged, and remaining risks or
tradeoffs.

## Agent Work Provenance and Independent Validation

- Agent role and identity: `<role, session/task ID, or None>`
- Handoff acceptance criteria: `<criteria or None>`
- Agent-claimed files and behavior: `<claim>`
- Agent-reported commands and results: `<commands, output/log paths, and statuses>`
- Phase evidence: `<for example, TDD RED/GREEN evidence or None>`
- Checksums or integrity evidence: `<files and checksums, or None>`
- Independently observed files and behavior: `<evidence>`
- Mismatches between claims and observations: `<None or details>`

Agent reports, task checkboxes, and claimed completion are claims rather than
proof. State that this verification proves the observed repository state and
executed evidence, not agent authorship or identity.

## Working-Tree Diff Review

Record the resolved base branch and review the complete diff, including tracked,
staged, unstaged, and untracked files. Document findings for quality, formatting,
repository conventions, scope control, and stray debugging statements.

## Automated Checks and Test Results

| Command | Working directory | Exit status | Result | Output or log path |
|---------|-------------------|-------------|--------|-------------------|
| `<exact command>` | `<path>` | `<status>` | `<pass/fail/blocked>` | `<output or path>` |

Include relevant manual reproduction steps when automation is unavailable.

## Requirements-to-Evidence Table

| ID | Requirement, scenario, acceptance criterion, or task | Status | Concrete evidence or reproduction steps |
|----|-------------------------------------------------------|--------|------------------------------------------|
| R1 | <requirement> | `verified` / `failed` / `not verified` / `blocked` | <evidence> |

Every source requirement, scenario, acceptance criterion, and claimed completed
task must appear in this table. Do not omit an item because evidence is missing.

## Assumptions, Unverified Areas, and Blockers

- Assumptions: `<None or list>`
- Unverified areas and risk: `<None or list>`
- Blockers: `<None or list>`

## Disposition

**`ready` / `not ready` / `needs human decision`**

Explain the verdict. Any failed, blocked, or not verified requirement makes the
result `not ready` unless an explicit human-approved waiver is recorded here
with its rationale. List all waivers prominently.

## GitHub Issue Comment

- Comment requested: `<yes/no>`
- Issue: `<URL or None>`
- Command used: `<exact command or None>`
- Exit status: `<status or None>`
- Comment ID or success confirmation: `<value or None>`
- Failure or skip reason: `<None or details>`
