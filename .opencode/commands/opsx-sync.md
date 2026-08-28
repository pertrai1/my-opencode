---
description: "Sync delta specs from a change to main specs"
---

Use `sdlc-orchestrator` as the workflow owner for this command.

Intent: sync a change's delta specs into the main specs using the orchestrator's change resolution and safety checks.

Input: `$ARGUMENTS`

Requirements:
- Preserve this command's user-facing intent: resolve the change, compare delta specs to main specs, perform the sync, and verify the result.
- Use the orchestrator's store-selection, status, instruction lookup, and user-confirmation rules.
- Let `sdlc-orchestrator` own sync gating and any follow-up verification.
