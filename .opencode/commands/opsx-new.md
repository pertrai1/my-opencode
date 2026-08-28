---
description: "Start a new change using the experimental artifact workflow (OPSX)"
---

Use `sdlc-orchestrator` as the workflow owner for this command.

Intent: start a new OpenSpec change from the supplied name or description.

Input: `$ARGUMENTS`

Requirements:
- Preserve this command's user-facing intent: resolve the change request, scaffold or select the change, inspect status, and stop at the first-artifact handoff unless the user explicitly asks to continue.
- Use the orchestrator's store-selection, target-resolution, schema-selection, and OpenSpec command rules.
- Let `sdlc-orchestrator` own change naming clarification, `openspec new change`, `openspec status`, and first-artifact instruction lookup.
- Do not reimplement lifecycle logic in this wrapper.
