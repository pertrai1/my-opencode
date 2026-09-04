---
description: Run the full or changed-file quality gate and summarize its JSON report.
agent: general
model: openai/gpt-5.6-luna
---

Run the quality-verification runner in the active worktree. Interpret
`$ARGUMENTS` before constructing the command:

```text
no arguments: node ~/.config/opencode/scripts/quality-verification.mjs --target .
changed:      node ~/.config/opencode/scripts/quality-verification.mjs --changed
```

With no arguments, analyze every non-ignored JavaScript and TypeScript file in
the worktree. When the first argument is `changed`, add `--changed` and pass
any remaining arguments through to the runner. Otherwise, append supplied
runner options after `--target .`.

The generated Markdown report lists the passing requirement for every check.
The canonical threshold table is in the repository `README.md` under
`Verification`.

Treat a non-zero exit code as a quality-gate failure, not a tool failure. After
the command completes:

1. Report the exact command and exit status.
2. Read both generated artifacts: `.agents/reports/quality-report-<TIMESTAMP>.json` for structured evidence and `.agents/reports/quality-report-<TIMESTAMP>.md` for the human-readable summary.
3. For every failed or errored check, report its check name, threshold, measured
   value or finding count, affected files, and the relevant diagnostic detail.
4. Give the smallest likely remediation for each failure. For example: simplify
   a function for complexity, add or improve tests for coverage/CRAP, remove an
   unused export for dead code, consolidate duplicate logic, shorten a file,
   or replace an explicit `any` or `unknown` type.
5. Separate analyzer errors from quality failures. For an error, explain what
   prevented verification and give the next command or configuration change to
   try; do not present it as a code defect.
6. State whether the full-project or changed-file quality gate passed when
   every selected check passes. If it failed, end with a concise ordered list
   of recommended fixes.

Use additional runner arguments after the command, for example:

```text
/quality --check loc --check types
/quality --check dead-code
/quality changed --check loc --check types
```
