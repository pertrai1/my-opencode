# Implementation Intent: Oracle and Do-Nothing Verifier Guardrails

## Selected Target Workspace
- Path: `/tmp/my-opencode` (harness repo being enhanced)
- Source of truth: GitHub Issue #36, repository `AGENTS.md`, research paper arXiv:2609.04128 (*Environment Evolution for Terminal Agents*)

## Key Architectural Decisions
1. **Change-Verifier Enhancement**:
   - Add explicit requirement in `agents/change-verifier.md` under `## Functional Check` and `## Evidence Checked`:
     - Every newly introduced verification test or functional check must establish baseline failure (demonstrating it fails on `git merge-base` or unpatched code).
     - Any check that passes on the unmodified base must be flagged as a vacuous/tautological pass.
2. **Test-Reviewer Enhancement**:
   - Add focus areas in `agents/test-reviewer.md` for detecting tautological tests, empty assertions, mock leakage, and lack of negative or baseline mutation sensitivity.
3. **TDD-Orchestrator Enhancement**:
   - Add "Pre-flight Baseline Oracle Check" in `agents/tdd-orchestrator.md` under Intake to run checks on the clean worktree before delegating Phase 0/1.
   - Formally document Phase 1 RED test verification as an explicit Do-Nothing Verifier.
4. **Verification Guidance Update**:
   - Update `.agents/docs/verification/README.md` to canonize Oracle and Do-Nothing verification standards.
   - Update `README.md` to reflect these standards in the Verification summary.

## Scope Boundaries
- Do not introduce breaking schema changes to `opencode.jsonc`.
- Do not add unnecessary external dependencies.
- Retain all existing permissions and role configurations.
