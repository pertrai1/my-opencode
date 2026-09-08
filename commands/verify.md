Verify completed work against the canonical rubric and source of truth. Save a target-local report by default; remote issue comments require explicit `--comment`.

## Usage

```text
/verify [source] [options]
```

### Arguments & Options
- `[source]` — Optional explicit source of truth (e.g., `issue-1`, `spec.md`). If omitted, auto-detects.
- `--core-only` — Run only the standard core rubric without source-specific checks.
- `--target <directory>` - Use this command directory instead of cwd; record the Git root separately.
- `--comment` - Explicitly authorize posting the full report on the linked GitHub Issue.
- `--no-comment` - Retained explicit local-only option; takes precedence over `--comment`.

---

## Instructions

Resolve the explicit target, otherwise cwd; do not assume the harness is the
target or require confirmation of an unambiguous directory. Read applicable
target instructions first. User requirements and target instructions override
harness metrics; extra global quality checks are advisory unless adopted.
Local-only means no remote writes, not a ban on source-of-truth reads.

### 1. Resolve Source of Truth
Determine the source of truth by checking in order:
1. **Explicit argument:** Use `source` if passed to the command.
2. **OpenSpec:** Search for active OpenSpec documents or specs in the repository.
3. **Linked GitHub Issue:** Query the branch name or local state for a linked/claimed issue.
4. **Project Configuration:** Check `opencode.jsonc` or project config files for a declared verification source.
5. **Auto-Detection:** Search the `.scratch/` directory or issue tracker for active features or tasks.
6. **Ask the User:** If no source is found and `--core-only` is not set, prompt the user to select or provide a source.

### 2. Perform Verification Using Standard Core Rubric
Reference the global harness guidance at `~/.config/opencode/.agents/docs/verification/README.md` and template at `~/.config/opencode/.agents/docs/verification/TEMPLATE.md`, not target-relative copies. Replace every template placeholder with evidence or explicitly mark it `None`, `not verified`, or `blocked`; an empty section is not a passing result. Execute and document each of the 7 required sections:
1. **Source & Scope Identification:** Document the source and scope (commits, files, directories).
2. **Work Summary:** Include a concise summary detailing what changed, which requirements were addressed, intended behavioral effects, what was not changed, and any remaining risks or tradeoffs.
2a. **Agent Work Provenance and Independent Validation:** Identify the agent role, session or task identity, handoff acceptance criteria, files and behavior the agent claimed to change, and any phase-specific evidence it reported. Record the agent-reported commands, outputs, test or contract checksums, and delegated results when available. Independently inspect the repository and rerun relevant checks; treat agent summaries, task checkboxes, and claimed completion as claims rather than proof. Record every mismatch between claimed and observed work. State explicitly that verification proves the observed repository state and executed evidence, not agent authorship or identity.
3. **Working-Tree Diff Review:** Resolve the repository's actual base branch (e.g., via `git symbolic-ref refs/remotes/origin/HEAD` falling back to main or develop) and inspect the complete change set—including tracked, staged, and untracked files—against that base branch for code quality and styling conventions while checking for stray debugging statements.
4. **Automated Checks:** Run `node ~/.config/opencode/scripts/checks-runner.mjs --target <command-directory>` for the baseline Node `typecheck`, `lint`, and `test` scripts, or supply repeatable `--command '["executable","arg"]'` options for the selected target-required checks. Cite its current-run `.agents/reports/checks-<RUN_ID>.{json,md}` pair for exact commands, exit statuses, bounded redacted logs, tools, environment, and before/after content fingerprints. Document required checks not executed. Evidence is stale if fingerprints are absent or differ before/after or from current content, or commands, tools, dependencies, or relevant environment changed. Git status paths alone are insufficient. Do not automate baseline worktree creation or integration actions.
5. **Requirements-to-Evidence Table:** Construct a table mapping every source requirement, scenario, acceptance criterion, and claimed completed task to concrete evidence. Use status values: `verified`, `failed`, `not verified`, or `blocked`.
6. **Assumptions, Unverified Areas, and Blockers:** Outline assumptions, unknowns, and blockers clearly.
7. **Disposition:** Conclude with an unambiguous disposition: `ready`, `not ready`, or `needs human decision`.
   - *Note:* `ready` is strict and requires all required core and source-specific checks to be verified and passed. List all waivers prominently if applicable.

### 3. Save Artifact
- Construct a full verification report in markdown format.
- Save the report under the target command directory's `.agents/reports/`.
- File name format: `verification-YYYYMMDD-HHMMSS-<source-slug>.md` (e.g., `verification-20260814-143022-issue-1.md`) containing a UTC timestamp with seconds to prevent collisions.
- Ensure the saved file includes metadata: git repository revision (current commit SHA), list of changed files, UTC timestamp, commands and tools executed, and exit status for each.

### 4. GitHub Issue Commenting
- Only if `--comment` is specified and a linked GitHub Issue is resolved or active, post the full verification report as a comment on that issue.
- Skip commenting by default, if `--no-comment` is specified, or if no remote GitHub issue can be linked. Do not commit, push, or create a PR as part of verification.
- If commenting fails after a linked issue is found, retain the artifact, record the command and non-zero exit status, and set the disposition to `not ready` or `needs human decision`.

### 5. Present Summary to User
- Provide a concise output in chat summarizing:
  1. The final verdict/disposition (`ready`, `not ready`, or `needs human decision`).
  2. The path where the full artifact was saved.
  3. Whether the report was successfully commented on GitHub.
