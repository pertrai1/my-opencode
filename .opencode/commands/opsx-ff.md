---
description: "Fast-forward through OpenSpec artifact creation"
---

Use `sdlc-orchestrator` as the workflow owner for this command.

Intent: fast-forward planning by creating the remaining requested artifacts in dependency order.

Input: `$ARGUMENTS`

Requirements:
- Preserve this command's user-facing intent: advance through multiple planning artifacts without stopping after each one.
- Use the orchestrator's store-selection, change-selection, artifact-order, planning delegation, and ambiguity rules.
- Let `sdlc-orchestrator` own status checks, artifact routing, and stop conditions.
