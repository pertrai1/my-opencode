---
description: "Implement tasks from an OpenSpec change (Experimental)"
---

Use `sdlc-orchestrator` as the workflow owner for this command.

Intent: implement the selected change by following the orchestrator's delivery rules and delegated TDD pipeline.

Input: `$ARGUMENTS`

Requirements:
- Preserve this command's user-facing intent: select the change, inspect apply state, implement the next valid work, update task completion only after verified evidence, and report progress.
- Use the orchestrator's store-selection, target-discovery, evidence-selection, verifier-mode, and task-completion rules.
- Let `sdlc-orchestrator` own `openspec status`, `openspec instructions apply`, execution-readiness checks, routing to `tdd-orchestrator` or direct-task mode, verification, and pause conditions.
- Do not reimplement lifecycle logic in this wrapper.
