---
description: "Archive multiple completed changes at once"
---

Use `sdlc-orchestrator` as the workflow owner for this command.

Intent: archive multiple completed changes only after per-change readiness, verification, and confirmation checks.

Input: `$ARGUMENTS`

Requirements:
- Preserve this command's user-facing intent: resolve the target changes, evaluate readiness for each, and archive the approved set.
- Use the orchestrator's store-selection, verification, and archive gate rules for every change in scope.
- Let `sdlc-orchestrator` own change selection, warnings, confirmations, and archive execution.
