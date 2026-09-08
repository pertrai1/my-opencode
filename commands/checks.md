---
description: Run target-repository checks and preserve reusable evidence.
agent: general
model: openai/gpt-5.6-luna
---

Use the explicit target directory, otherwise cwd. Keep the command directory
separate from the Git root (especially for nested packages); ask only if ambiguous.
Run the checks runner from that directory. Before running it, inspect
applicable target-repository instructions (`AGENTS.md`, README, and project
verification documentation). User requirements and target instructions override
harness metrics; extra global quality checks are advisory unless adopted.
By default the runner covers conventional Node `typecheck`, `lint`, and `test`
package scripts. Repeatable `--command` JSON argv arrays replace these defaults
for arbitrary target-required commands, without an implicit shell or new manifest.

Interpret `$ARGUMENTS` as runner options:

```text
no arguments: node ~/.config/opencode/scripts/checks-runner.mjs
target path:  node ~/.config/opencode/scripts/checks-runner.mjs --target <path>
raw options:  node ~/.config/opencode/scripts/checks-runner.mjs <options>
custom:       node ~/.config/opencode/scripts/checks-runner.mjs --command '["make","test"]'
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
    historical memory; compare its before/after content fingerprints and current
    target workspace, commands, tools, and relevant environment. Missing or changed
    evidence requires a rerun; status paths alone do not establish freshness.
6. State which target-required checks remain outside this baseline runner.
