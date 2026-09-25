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
4. Run `node scripts/work-item.mjs create ...` from the target repository.
5. Return the work ID and the paths created under `.agents/work/<work-id>/`.
6. On a later session, run `node scripts/work-item.mjs resume <work-id>` before making decisions about the request.

## Tracker independence

Local records are the core protocol. External systems are optional adapters. Do not assume GitHub Issues, `gh`, Jira, Linear, network access, or credentials are available.

## Current boundary

This skill owns durable intake and resume only. Lifecycle transitions, route-specific execution, external tracker synchronization, and delivery closure belong to later workflow slices.
