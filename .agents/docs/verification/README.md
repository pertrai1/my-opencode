# Shared Agent Verification Guidance & Evaluation Rubric

This document defines the canonical evaluation rubric and operating expectations for verifying agent-completed work. All agent verification workflows, specifically the `/verify` command and relevant engineering skills, must adhere to this standard.

---

## 1. Invocation Model & Expectations

- **User-Invoked Only:** Verification is a user-invoked workflow (e.g., via `/verify`).
- **No Automatic Gate:** Verification is never an automatic, mandatory workflow gate in the agent loop. The user decides when to request it.
- **Progressive Disclosure:** Skills and commands must reference this shared guidance (e.g., pointing to `.agents/docs/verification/README.md`) instead of duplicating the full rubric, maintaining a single source of truth.

---

## 2. Source of Truth & Precedence

Verification must utilize a standard core rubric combined with source-specific checks. The selected source of truth is resolved via the following precedence:

1. **Explicit Argument:** Any source explicitly passed to the `/verify` invocation (e.g., `/verify issue-42` or `/verify spec.md`).
2. **Active OpenSpec:** An active OpenSpec change or specification document detected in the workspace.
3. **Linked GitHub Issue:** A linked or claimed GitHub Issue currently active in the branch or session context.
4. **Project-Level Configuration:** A preferred verification source declared in the project configuration (e.g., in `opencode.jsonc` or a project-level configuration file).
5. **Auto-Detection Fallback:** Automatic scanning of the branch name, issue tracker, or `.scratch/` directory for active tasks.
6. **Ask the User:** If no verification source can be determined, the agent must present the available options and ask the user to choose or provide one.

*Note: Invoking `/verify --core-only` runs only the standard core rubric without any source-specific checks.*

---

## 3. Standard Core Rubric

Every verification report must follow this exact 7-section structure:

### Section 1: Source and Scope Identification
- Declare the resolved source of truth (including URL, issue number, or file path).
- State the scope of the verification (files changed, commit hashes, or directories).

### Section 2: Work Summary
Provide a concise, human-readable summary of the completed work so a human can assess if the agent understood the requirements before reviewing detailed evidence. Explain:
- What changed (specific additions, modifications, or deletions).
- Which requirement each change addresses.
- The intended behavioral effect of the changes.
- What was deliberately left unchanged (and why).
- Remaining risks, uncertainty, or architectural tradeoffs.

### Section 3: Working-Tree Diff Review
- Review the complete diff of all changes against the base branch (`main` or equivalent).
- Verify code quality, formatting, styling conventions, and lack of stray debugging statements.

### Section 4: Automated Checks & Test Results
- Run and display the output of relevant automated checks, linters, and test suites (e.g., `pytest`, `npm test`, `eslint`, `mypy`).
- Include the exact command run, exit status, and a condensed summary of passes/failures.

### Section 5: Requirements-to-Evidence Table
A structured matrix mapping each requirement from the source of truth to concrete, reproducible evidence.

| ID | Requirement Description | Status | Concrete Evidence / Reproduction Steps |
|----|------------------------|--------|----------------------------------------|
| R1 | [Requirement 1] | `verified` | E.g., test log output showing pass, or manual execution step. |
| R2 | [Requirement 2] | `blocked` | E.g., external dependency unavailable. |

**Allowed Status Values:**
- `verified`: Concrete evidence confirms the requirement is satisfied.
- `failed`: Evidence shows the requirement is not satisfied or is broken.
- `not verified`: Not yet tested or verified by the agent.
- `blocked`: Cannot be verified due to external constraints or failures.

### Section 6: Assumptions, Unverified Areas, and Blockers
- Clearly state any assumptions made during implementation.
- List unverified areas (e.g., production volume, timing/race conditions, cross-platform quirks).
- Detail any blockers or unresolved dependencies.

### Section 7: Clear Disposition
Every report must end with a single, unambiguous verdict:
- **`ready`**: Strict policy. All required core checks and source-specific checks are fully verified and pass without regressions.
- **`not ready`**: One or more checks have failed, are blocked, or remain unverified.
- **`needs human decision`**: Requires user review (e.g., a waiver is needed or there is an architectural tradeoff).

*Waiver Policy:* Explicit user-approved waivers are allowed to bypass certain checks, but any waiver must remain highly visible in this section with its rationale.

---

## 4. Evidence Expectations

To prevent unsupported conclusions:
- The report must identify the claims being evaluated.
- Each claim must be mapped to concrete evidence (e.g., test outputs, CLI commands run, or generated files).
- The agent must never say "it is verified" without presenting real command execution output or test logs.

---

## 5. Output and Artifact Handling

- **Concise Chat Output:** When run in interactive chat, the agent's output should be concise, providing only the final verdict (disposition) and the file path to the saved full artifact.
- **Saved Artifact Path:** Save the full markdown report under `.agents/docs/verification/`.
- **Saved Artifact Naming:** `verification-YYYYMMDD-HHMMSS-<source-slug>.md` (e.g., `verification-20260814-143022-issue-1.md`) containing a UTC timestamp with seconds to prevent collisions.
- **Required Metadata:** The saved artifact must record:
  - Repository revision (git SHA).
  - List of changed files.
  - UTC timestamp of verification.
  - Commands and tools used during verification.
  - Exit status for each command or tool.

---

## 6. GitHub Issue & PR Integration

- **Issue Comments:** When a linked GitHub Issue exists, the complete verification report should be posted as a comment on the issue by default.
- **Full Report:** The posted comment must contain the full verification report, not just a high-level summary.
- **Opt-Out:** The user can opt out of posting comments by using the `--no-comment` flag.

---

## 7. Skill Integration & Proof of Work

Engineering skills must integrate with this shared verification standard using **progressive disclosure**—pointing to this README instead of duplicating the rubric. 

Furthermore, skills must show **Proof of Work** in their success criteria:

### debug-like-expert
- When completing an investigation, the agent must output proof of work showing:
  - The exact hypotheses tested and the commands/scripts run to test them.
  - The exit status and outputs of all diagnostic tools.
  - A structured mapping of findings to the recommended fix.

### test-driven-development (TDD)
- The agent must output proof of work proving:
  - The exact test file and test case written first (Red phase).
  - The command run showing the test failed for the expected reason.
  - The minimal code change made (Green phase).
  - The command run showing the test passed.
  - Any refactoring steps taken and verification that the test suite remains green.

### Future reviewer/implementer skills
- Any future code-reviewer, code-implementer, or refactoring skills must inherit these proof of work standards and reference this verification framework.
