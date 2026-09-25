---
description: Run the AI-DLC Inception phase to break a work-item intent into approved units before OpenSpec planning.
agent: sdlc-orchestrator
---

Run AI-DLC Inception for this intent: $ARGUMENTS

1. If `$ARGUMENTS` is an existing work ID, resume it with `work-item.mjs resume <work-id>`. Otherwise, create a work item first as `/intake` does.
2. Scaffold the inception artifacts:

   ```sh
   node ~/.config/opencode/scripts/work-item.mjs init-inception <work-id>
   ```

3. Delegate to `inception-author` in `plan` mode. Present `plan.md` and its open questions to the human. Do not continue until the human approves the plan and answers the questions.
4. Delegate to `inception-author` in `execute` mode with the approved plan and the answers.
5. Present `stories.md`, `nfr.md`, `risks.md`, `units.md`, and the registered units. Apply requested corrections by re-delegating to `inception-author`.
6. Only after the human explicitly approves the units, record the approval:

   ```sh
   node ~/.config/opencode/scripts/work-item.mjs approve-inception <work-id> --by <name> --note "<summary of approval>"
   ```

7. Report the approved units in dependency order and the next action. For each unit, the next step is to start an OpenSpec change seeded from that unit's stories, NFRs, and risks, then run `work-item.mjs link-unit <work-id> <unit-id> --change <change-name>`.

Never run `approve-inception` without explicit human approval in this session.
