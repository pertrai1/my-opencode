---
description: "Verify implementation matches change artifacts before archiving"
---

Use `sdlc-orchestrator` as the workflow owner for this command.

Intent: verify the selected change against its planning artifacts and write the persisted human-readable verification summary.

Input: `$ARGUMENTS`

Requirements:
- Preserve this command's user-facing intent: select the change, gather current planning and implementation evidence, run delegated verification, and report archive-readiness input.
- Use the orchestrator's store-selection, target-evidence, verifier-mode, `change-verifier`, and `verification.md` rules.
- Let `sdlc-orchestrator` own change selection, status lookup, verification routing, blocker/warning handling, and follow-up decisions.
- Do not reimplement lifecycle logic in this wrapper.
