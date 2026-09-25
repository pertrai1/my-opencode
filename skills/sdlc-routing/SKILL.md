---
name: sdlc-routing
description: Route feature work, defects, and brainstorming through a proportionate software delivery workflow. Use for SDLC intake, deciding when to use OpenSpec, tasks, contracts, TDD, or independent verification.
---

# Adaptive SDLC routing

Use the workflow most likely to produce a correct, reviewable result with the least process overhead.

## Feature work
- Always make a short list of independently checkable tasks.
- Small, bounded, clear behavior: task list + implementation + focused verification.
- Broad or high-risk behavior: OpenSpec artifacts as needed (proposal, scenarios/spec, design, tasks), then implement in verifiable slices.
- Create types/interfaces when a real public or cross-module contract needs to be explicit.
- Use types → RED → GREEN only when the test layer and risk make role separation useful. It is not the default for every behavior change.

Escalate to full planning when there are multiple interacting systems, material product/design uncertainty, data or API migration, security/privacy exposure, hard rollback, or high integration risk. State why artifacts were included or skipped.

## Defects
1. Reproduce before editing and record observed behavior.
2. Decide whether a regression test is warranted; if not, state why.
3. Fix the smallest cause.
4. Re-run reproduction plus the narrowest relevant test/type/lint check.
5. Use an independent reviewer when impact, ambiguity, or risk warrants it.

## Brainstorming
- Start by exploring the idea with the user.
- Wait until the problem is clear and the session is making useful progress before drafting.
- Then create/update a durable handoff document capturing problem, outcome, options, decisions, assumptions, open questions, and next step.
- Let the document later become context for a follow-up session, an issue, or an OpenSpec change.

## Verification
- Verify each implementation task with direct evidence.
- Use separate verifier agents for consequential artifacts or high-risk changes, not as an automatic stage for every small edit.
- Keep the evidence proportional: concise session evidence for light changes; persisted `verification.md` for full OpenSpec changes.
- Do not archive OpenSpec changes before showing evidence and receiving human approval.
