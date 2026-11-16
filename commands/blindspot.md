---
description: Surface unknown unknowns before planning or implementing a task. Read-only.
---

Run a blind spot pass on this task before any planning or code. This command is read-only: do not edit files.

Task: $ARGUMENTS

If the task is empty, ask for it in one sentence and stop.

## Context to apply

- The user is a senior TypeScript/Angular engineer with backend experience. Assume they know the stack and the standard practices. Do not explain basics.
- Inspect the repository first: nearest `AGENTS.md`, `README*`, `CONTEXT.md`, relevant ADRs, and the code the task touches. Anchor every item in what you found, and say when you could not verify it.

## What to produce

List the user's likely **unknown unknowns** for this task: things they have probably not considered, including how good the result could be. Cover these, skipping any that do not apply:

- Constraints in the code, data, or environment that the task description does not mention.
- Assumptions the task makes that the repository contradicts.
- Obvious-to-the-user expectations that nobody wrote down (unknown knowns) and that an implementer would have to guess.
- Decisions that are expensive to change later (data models, public types, user-facing flows).
- A better outcome or simpler approach than the one the task implies.

Rank items by how much each would change the architecture or scope. For each item give one line on the item, one line on the evidence, and the question or decision it forces.

## Finish

End with the top three items to resolve first and a suggested next step: `/interview` for open questions, `/prototype` for visual or flow uncertainty, or planning if nothing material remains.
