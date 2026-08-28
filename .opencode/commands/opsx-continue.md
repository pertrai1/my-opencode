---
description: "Continue working on a change - create the next artifact (Experimental)"
---

Use `sdlc-orchestrator` as the workflow owner for this command.

Intent: continue the selected change by advancing exactly one planning step when applicable.

Input: `$ARGUMENTS`

Requirements:
- Preserve this command's user-facing intent: select the change, inspect status, create or delegate the next ready planning artifact, then stop.
- Use the orchestrator's store-selection, change-selection, artifact-routing, ambiguity, and post-write status rules.
- Let `sdlc-orchestrator` own `openspec status`, `openspec instructions`, dependency reads, planning delegation, and completion checks.
- Do not reimplement lifecycle logic in this wrapper.
