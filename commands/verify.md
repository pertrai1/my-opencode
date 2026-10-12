Verify completed work against the canonical rubric and source of truth. Saves a full report as an artifact and comments on the linked GitHub Issue by default.

## Usage

```text
/verify [source] [options]
```

### Arguments & Options

- `[source]` — Optional explicit source of truth (e.g., `issue-1`, `spec.md`). If omitted, auto-detects.
- `--core-only` — Run only the standard core rubric without source-specific checks.
- `--no-comment` — Do not post the full verification report as a comment on the linked GitHub Issue.

---

## Instructions

### 1. Load Guidance and Resolve Source

Read `.agents/docs/verification/README.md` for source precedence, the seven-section
report format, evidence statuses, disposition rules, and artifact metadata.
Resolve the source using that guidance; ask if none is available unless
`--core-only` was requested.

### 2. Verify the Change

- Resolve the actual base branch (for example, with `git symbolic-ref refs/remotes/origin/HEAD`; inspect available branches if it is unset).
- Inspect the complete change set against that base, including tracked, staged, and untracked files.
- Run relevant checks and record the exact commands, exit statuses, and condensed results.
- Map each requirement to evidence and record missing checks, blockers, and any explicit user-approved waivers.

### 3. Save Artifact

Write the full report under `.agents/docs/verification/` using the naming and
metadata requirements in the shared guidance. Set the disposition from the
observed evidence, not from completion claims.

### 4. GitHub Issue Commenting

- If a linked GitHub Issue is resolved or active, post the full verification report as a comment on that issue.
- Skip commenting if `--no-comment` is specified or if no remote GitHub issue can be linked.
- If commenting fails after a linked issue is found, retain the artifact, record the command and non-zero exit status, and set the disposition to `not ready` or `needs human decision`.

### 5. Present Summary to User

- Provide a concise output in chat summarizing:
  1. The final verdict/disposition (`ready`, `not ready`, or `needs human decision`).
  2. The path where the full artifact was saved.
  3. Whether the report was successfully commented on GitHub.
