---
description: Run target-repository baseline Node checks and preserve reusable evidence.
agent: general
model: openai/gpt-5.6-luna
---

Run the checks runner from the active target worktree. Before running it, inspect
applicable target-repository instructions (`AGENTS.md`, README, and project
verification documentation). The runner covers only the conventional Node
`typecheck`, `lint`, and `test` package scripts; it does not replace any
additional project-required checks.

Interpret `$ARGUMENTS` as runner options:

```text
no arguments: node ~/.config/opencode/scripts/checks-runner.mjs
target path:  node ~/.config/opencode/scripts/checks-runner.mjs --target <path>
raw options:  node ~/.config/opencode/scripts/checks-runner.mjs <options>
```

After completion:

1. Report the exact command and exit status.
2. Read both exact report paths printed by the runner:
   `.agents/reports/checks-<RUN_ID>.json` and `.agents/reports/checks-<RUN_ID>.md`.
3. Summarize the overall status, package manager, each stage status, and every
   `not-configured`, `not-run`, failed, blocked, or error outcome.
4. For a failed or errored stage, include its command, exit code or timeout, and
   condensed redacted diagnostics; distinguish a project-check failure from a
   runner/setup/report error.
5. State whether the report is current-run evidence. A prior report is only
   historical memory; compare its recorded repository state with the current
   target workspace and rerun before presenting it as current verification.
6. State which target-required checks remain outside this baseline runner.
