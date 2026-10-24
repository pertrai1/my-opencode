---
description: Run the AI-DLC Inception phase to break a work-item intent into approved units before OpenSpec planning.
agent: sdlc-orchestrator
---

Run AI-DLC Inception for this intent: $ARGUMENTS

Resolve the target root using the orchestrator's target-workspace rules before any work-item operation. Pass that root explicitly to every `work-item.mjs` invocation, including creation through `/intake`; do not assume the shell working directory is the target. Run OpenSpec commands in the resolved target root and preserve the selected store.

1. If `$ARGUMENTS` is an existing work ID, resume it with `work-item.mjs resume --root "<resolved-target-root>" <work-id>`. Otherwise, create a work item first as `/intake` does.
2. Scaffold the inception artifacts:

   ```sh
   node ~/.config/opencode/scripts/work-item.mjs init-inception --root "<resolved-target-root>" <work-id>
   ```

3. Run the before/after snapshot scope check from `sdlc-orchestrator` around every `inception-author` delegation, including this first call. Delegate to `inception-author` in `plan` mode. Present `plan.md` and its open questions to the human. Do not continue until the human approves the plan and answers the questions.
4. Delegate to `inception-author` in `execute` mode with the approved plan and the answers. Run the scope check from `sdlc-orchestrator` before and after every `inception-author` delegation.
5. Register the units from the `Proposed Units` result, in dependency order:

   ```sh
   node ~/.config/opencode/scripts/work-item.mjs add-unit --root "<resolved-target-root>" <work-id> --name "<name>" --summary "<one line>" --story US-1 --depends-on u-<other>
   ```

6. Present `stories.md`, `nfr.md`, `risks.md`, `units.md`, and the registered units. For corrections, re-delegate to `inception-author`, then apply its `Proposed Units` result with `add-unit`, `update-unit`, or `remove-unit`:

   ```sh
   node ~/.config/opencode/scripts/work-item.mjs update-unit --root "<resolved-target-root>" <work-id> <unit-id> --story US-1 --story US-4 --depends-on u-<other>
   node ~/.config/opencode/scripts/work-item.mjs update-unit --root "<resolved-target-root>" <work-id> <unit-id> --clear-dependencies
   node ~/.config/opencode/scripts/work-item.mjs remove-unit --root "<resolved-target-root>" <work-id> <unit-id>
   ```

7. Only after the human explicitly approves the units, record the approval:

   ```sh
   node ~/.config/opencode/scripts/work-item.mjs approve-inception --root "<resolved-target-root>" <work-id> --by <name> --note "<summary of approval>"
   ```

   If it reports validation errors, send them back to `inception-author`. Do not approve until the command succeeds.
8. Report the approved units in dependency order and the next action. For each unit, start an OpenSpec change seeded from that unit's stories, NFRs, risks, and measurement criteria. In the resolved target root, confirm the change with `openspec show <change-name>` for the default store; when a non-default store is selected, include the sticky `--store <id>` option. Only after successful verification, run `work-item.mjs link-unit --root "<resolved-target-root>" <work-id> <unit-id> --change <change-name>`.

Never run `approve-inception` without explicit human approval in this session. Never pass `--parallel` to `link-unit` without the human's approval, and always record it with `--note`.
