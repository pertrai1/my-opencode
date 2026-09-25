---
description: Create or resume a tracker-neutral durable work item for a user request.
agent: sdlc-orchestrator
---

Use the tracker-neutral work-item intake workflow for this request.

1. Classify the request as `feature`, `defect`, `brainstorm`, `chore`, `investigation`, `operational`, or `other`.
2. Identify concise acceptance criteria, initial risk, and the likely route. Do not invent product decisions that require the user.
3. Create the durable local record with:

```sh
node ~/.config/opencode/scripts/work-item.mjs create --request "$ARGUMENTS" --type <type> --risk <risk> --route <route>
```

4. Include repeated `--acceptance "..."` arguments when acceptance criteria are already clear.
5. Return the generated work ID, record path, classification, next action, and any unresolved questions.

GitHub, Jira, Linear, or another tracker may be linked later. Do not require an external tracker for intake.
