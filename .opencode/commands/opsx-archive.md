---
description: "Archive a completed change in the experimental workflow"
---

Use `sdlc-orchestrator` as the workflow owner for this command.

Intent: archive the selected change only after the orchestrator confirms current verification state, human approval, and any required sync or archive preconditions.

Input: `$ARGUMENTS`

Requirements:
- Preserve this command's user-facing intent: select the change, assess archive readiness, handle any needed sync or confirmations, and archive only when allowed.
- Use the orchestrator's store-selection, status, verification, human-approval, and archive gate rules.
- Let `sdlc-orchestrator` own status lookup, optional archive-specific instruction lookup, sync decisions, user confirmations, and archive execution.
- Do not reimplement lifecycle logic in this wrapper.
