## Context

See `intent.md` for motivation. 

## Goals / Non-Goals

**Goals:**

List of goals for this spec

**Non-Goals:**

List of non-goals for this spec

## Decisions

One or more designs that resemble the example below:

### Decision: Use one top-level lifecycle orchestrator
Create an `sdlc-orchestrator` primary agent that acts as the workflow authority for a change.

Rationale:
- One place decides store selection, change selection, stage transitions, and archive readiness.
- One place runs OpenSpec CLI commands, which keeps workflow state coherent.
- One place can convert implementation drift into planning updates instead of letting each workflow invent its own behavior.

Alternatives considered:
- Keep separate smart command prompts plus a separate implementation orchestrator: rejected because it duplicates control logic.
- Put all planning and implementation details into one giant agent with broad edit powers: rejected because it weakens safety boundaries.

## Risks / Trade-offs

A list of risks and trade-offs that have been identified

## Migration Plan

Numbered list of items that will make up the plan
