---
description: Interview the user one question at a time to resolve ambiguities before planning. Read-only.
---

Interview me about this task until the ambiguities that matter are resolved. This command is read-only: do not edit files.

Task: $ARGUMENTS

If the task is empty, ask for it in one sentence and stop.

## Rules

- Inspect the repository first (nearest `AGENTS.md`, `README*`, `CONTEXT.md`, relevant ADRs, affected code). Never ask what the repository already answers.
- Ask **one question at a time** and wait for the answer. Use the question tool when available, with two to four concrete options and a recommended default; otherwise ask in plain text.
- Order questions by impact: ask first whichever answer would most change the architecture, data model, public types, or user-facing flow. Leave naming, styling, and mechanical details for last or decide them yourself and state the choice.
- Each question states what it affects, so the answer is easy to give.
- If an answer exposes a new ambiguity, follow it before returning to the list.
- Stop when remaining unknowns would not change the design. Do not interview for completeness.

## Finish

Summarize as a short brief:

1. Decisions made, each with the user's stated reason.
2. Assumptions you are proceeding on.
3. Open items the user chose to defer.

Then suggest the next step (`/prototype`, planning, or implementation). Return the brief in chat only. If the work spans multiple stages or files, say it should be recorded in the active work item's `intent.md` or `progress.md` (or a new work item via the `work-intake` skill) and offer to do that once I authorize edits; do not write it yourself.
