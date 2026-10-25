---
name: work-intake
description: Create and resume tracker-neutral durable work items for feature, defect, brainstorm, chore, investigation, and operational requests.
---

# Work intake

Use this skill when a user request needs to survive the current session or be routed into a delivery workflow.

## Protocol

1. Classify the request without silently resolving material ambiguity.
2. Capture acceptance criteria when they are known.
3. Choose initial risk and a provisional route; the route can be revised later.
4. Run `node ~/.config/opencode/scripts/work-item.mjs create ...` from the target repository.
5. Return the work ID and the paths created under `.agents/work/<work-id>/`.
6. Before substantial execution, expand the generated `progress.md` with acceptance criteria, a checklist, verification results, blockers, and one next action. Follow `docs/agents/work-items.md` in the `workflow` reference. Reuse an existing workflow checkpoint instead of duplicating it.
7. On a later session, run `node ~/.config/opencode/scripts/work-item.mjs resume <work-id>`, then read `.agents/work/<work-id>/progress.md` and its relevant evidence before making decisions. The command returns intake metadata only; it does not return the current checkpoint.
8. Reconstruct the session checklist from that checkpoint. After compaction, reread it before acting. If the work ID is unknown, use `list` and ask when multiple records could match.

## Tracker independence

Local records are the core protocol. External systems are optional adapters. Do not assume GitHub Issues, `gh`, Jira, Linear, network access, or credentials are available.

## Current boundary

This skill owns durable intake and resume, including locating the execution checkpoint. `AGENTS.md` and `docs/agents/work-items.md` own ongoing checkpoint maintenance. Lifecycle transitions, route-specific execution, external tracker synchronization, and delivery closure belong to later workflow slices.
