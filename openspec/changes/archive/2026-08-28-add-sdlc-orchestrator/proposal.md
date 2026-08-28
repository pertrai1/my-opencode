## Why

The current workflow splits lifecycle control across separate OpenSpec command prompts and a standalone implementation orchestrator. That makes it harder to keep planning, implementation, verification, and archive behavior coherent, and it leaves no single agent responsible for producing a human-ready summary of completed work.

## What Changes

- Add a top-level SDLC orchestrator agent that acts as the primary workflow controller for a change from intake through archive.
- Move OpenSpec CLI ownership to the orchestrator so change selection, artifact progression, validation, and archive decisions come from one place.
- Define delegated subagent roles for planning, implementation, verification, and review, with strong permission boundaries between them.
- Require persisted human-readable verification summaries so a human in the loop can review what changed, what evidence was checked, and what remains open.
- Keep implementation intelligence intentionally lower than planning intelligence by front-loading reasoning into proposal, spec, design, and task artifacts.
- Treat this repository as the OpenCode harness and require the orchestrator to target a selected active workspace repository for all verification/lifecycle command decisions, rather than hard-coding behavior to the harness project layout.

The harness provides command and orchestration surfaces (`openspec`, agents, commands), while the selected workspace is where the SDLC orchestrator evaluates project evidence and selects verification commands.

## Capabilities

### New Capabilities
- `sdlc-orchestrator`: End-to-end change orchestration that owns OpenSpec workflow transitions, delegates SDLC roles to subagents, and produces persisted verification summaries for human review.

### Modified Capabilities

## Impact

- Affected agent definitions under `agents/`
- Affected command prompts under `.opencode/commands/`
- New or updated OpenSpec planning artifacts for orchestration workflow decisions
- Verification and review workflow behavior, especially around human approval and archive readiness
