---
description: Build a cheap throwaway prototype (mocked UI, fake data) to find unknowns before wiring real code.
---

Build a throwaway prototype for this idea so we can react to something concrete before committing to a design.

Idea: $ARGUMENTS

If the idea is empty, ask for it in one sentence and stop.

## Rules

- Prototype only what is uncertain: a user-facing flow, a layout, or an interaction. Use hard-coded fake data. No backend calls, no real state management, no persistence, no new dependencies.
- Prefer one self-contained HTML file. Use the project's framework only when the question is specifically about that framework's behavior. If you do, keep it outside application source.
- Write everything under `.agents/prototypes/<short-slug>/`. Do not modify application code, tests, package files, or configuration.
- For visual or layout questions, produce two or three contrasting directions rather than one polished attempt. Label them.
- If the user cannot describe what they want, ask for a reference (source code in any language, an existing page, a product) and read it instead of guessing.
- For frontend work, load the `frontend-a11y` skill and keep the prototype keyboard-operable with visible focus and labelled controls, so the flow you test is the accessible one.
- Time-box the effort. A prototype that needs real plumbing to be useful has the wrong scope; say so and narrow it.

## Finish

Report:

1. The path to open and how to open it.
2. What the prototype is meant to answer, and which parts are faked.
3. Questions it surfaced that were not in the original idea.

Then offer to record decisions made from it in a short note (`.agents/prototypes/<slug>/NOTES.md`) so a later planning step starts from the prototype and the notes, not from the conversation.
