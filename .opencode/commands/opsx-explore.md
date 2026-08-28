---
description: "Explore a change, idea, or design in OpenSpec context"
---

Use `sdlc-orchestrator` as the lifecycle owner for this command and delegate read-only exploration to `explore` when helpful.

Intent: explore a change, idea, comparison, or problem in OpenSpec context without implementing.

Input: `$ARGUMENTS`

Requirements:
- Preserve explore-mode behavior and read-only stance.
- Use the orchestrator to resolve store, target workspace, and change context when needed.
- Let `sdlc-orchestrator` decide whether the session stays exploratory or should point toward planning artifacts, while `explore` handles the deep read-only investigation.
