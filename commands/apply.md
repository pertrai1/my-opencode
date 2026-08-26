---
description: Implement a change via the strict type-driven TDD pipeline (types → RED → GREEN) with separated agents
agent: tdd-orchestrator
---

Implement the following via the strict type-driven TDD pipeline: $ARGUMENTS

Follow your full protocol:

1. Intake (openspec artifacts if present, otherwise derive and confirm a task list)
2. Classify each task (full pipeline / type-author only / direct)
3. For behavioral tasks: Phase 0 types → Phase 1 RED → Phase 2 GREEN, with independent verification and checksum checks between phases
4. Update progress.md and intent.md as you go
5. Report a final summary: slices completed, evidence per phase, open issues
