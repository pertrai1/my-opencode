---
description: Audit this entire codebase for materially useful simplifications in its data structures, state representation, control flow, algorithms, and ownership.
agent: plan
model: opencode-go/deepseek-v4-flash
---

Audit only.

Hard rules:

- Do not edit source files, run tests, implement recommendations, commit, or push.
- Read-only inspection commands are allowed.
- Create exactly one file in the target repository: `.agents/docs/audits/<YYYY-MM-DD>-completed.md`, using the current UTC date.
- Do not change any other repository files.

Goal:

- Review the full repository for materially useful simplifications in data structures, state representation, control flow, algorithms, and ownership boundaries.
- Return a small set of concrete, high-value recommendations that reduce real complexity, invalid states, duplicated logic, or unclear ownership.

Do not recommend changes solely for style, hypothetical extensibility, minor line-count reduction, or abstraction that only relocates complexity.

Prefer local, boring code when it is already clear.

## Output Contract

Write the full audit to `.agents/docs/audits/<YYYY-MM-DD>-completed.md` in the repository root being audited. That file is the canonical deliverable.

In chat, return only:

- artifact path;
- whether the audit completed successfully;
- the top recommendations.

## Context-Window Discipline

- Keep chat terse. Put the full audit in the artifact, not in chat.
- Use the artifact as the persistent working memory surface.
- Summarize aggressively. Do not copy large code blocks or long file excerpts.
- Store evidence as file paths and exact line references, not pasted code, unless a tiny excerpt is necessary.
- Review in bounded batches. After a subsystem is covered, do not re-read it unless validating a finding or resolving overlap.
- Keep worker outputs terse and evidence-first.
- Use tables for inventory and skip coverage.

## Subsystem Rule

A subsystem is a cohesive implementation area with:

- a distinct ownership boundary;
- a recognizable implementation cluster such as a package, directory, feature area, adapter, service, module group, or tooling area;
- at least one meaningful interface to the rest of the repository.

Do not use broad catch-all rows when the code clearly contains separable areas.

Include frontend, backend, shared infrastructure, platform bridges, generated-contract ownership, and test or tooling infrastructure when materially relevant.

## Procedure

### 1. Build the coverage contract

Inventory every identifiable subsystem before judging completion.

For each subsystem, record only what is needed for coverage:

- ID;
- Name;
- Ownership Boundary;
- Key Files;
- Interfaces And Call Sites;
- Tests;
- Status: `queued`, `in review`, `recommend`, or `skip`.

This inventory is the coverage contract. The audit is not complete until every row ends in `recommend` or `skip`.

If you discover an omitted subsystem later, add a new row. Do not broaden an already-reviewed row to hide the omission.

### 2. Run bounded reviews

Use fresh, read-only workers where available. Give each worker one distinct subsystem with a non-overlapping boundary.

If workers are unavailable, perform the same bounded reviews sequentially.

Keep concurrency bounded to what you can coordinate. Use one consolidated wait mechanism.

For each subsystem, inspect implementation, interfaces, major call sites, and tests. Stay inside the ownership boundary.

Return at most two opportunities per subsystem. If nothing clears the materiality bar, return `skip`.

Look for:

- invalid or contradictory state encoded through booleans or nullable fields;
- repeated shape assumptions that need one shared typed model;
- duplicated branching removable by a map, registry, reducer, or command model;
- unclear ownership that a smaller module boundary would clarify;
- repeated scans or lookups that a better collection or index would simplify;
- lifecycle, concurrency, or async state that permits stale or contradictory state.

For each opportunity, record:

- Verdict: `recommend` or `skip`;
- Evidence with exact file and line references;
- Current complexity or invalid states;
- Simpler proposed representation;
- Smallest credible implementation scope, including affected files and interfaces;
- Risks and migration concerns;
- Existing validation and additional validation required;
- Confidence: `high`, `medium`, or `low`.

### 3. Validate and deduplicate

Independently verify every proposed finding against the current repository before accepting it.

Reject, narrow, or demote findings that are vague, duplicate another finding, misunderstand intent, fail the materiality bar, or merely move complexity.

Assign each accepted recommendation to exactly one authoritative subsystem.

Record skips as completed coverage.

### 4. Audit the audit

Run final passes for:

- missing subsystem boundaries or coverage gaps;
- duplicate ownership or overlapping findings;
- over-abstraction or weak materiality;
- report schema completeness;
- dependency-aware priority ranking.

If a pass finds an omission or structural problem, fix the artifact before finishing.

## Required Artifact Schema

Use this exact section order in `.agents/docs/audits/<YYYY-MM-DD>-completed.md`:

1. `# Audit Report`
2. `## Metadata`
3. `## Subsystem Inventory`
4. `## Accepted Recommendations`
5. `## Explicit Skips`
6. `## Cross-Cutting Patterns`
7. `## Duplicates And Superseded Findings`
8. `## Priority Ranking And Dependencies`
9. `## Audit Log`
10. `## Completion Checklist`

Required contents:

- `## Metadata`: repository root path, current commit SHA if available, UTC timestamp, artifact path, whether workers were used.
- `## Subsystem Inventory`: one table row per subsystem with columns `ID | Name | Ownership Boundary | Key Files | Interfaces And Call Sites | Tests | Status`.
- `## Accepted Recommendations`: one subsection per accepted finding with subsystem ID and name, title, priority `P1`/`P2`/`P3`, concrete impact, evidence, current complexity, simpler representation, implementation scope, risks, validation, dependencies, confidence.
- `## Explicit Skips`: every `skip` subsystem with a short reason.
- `## Cross-Cutting Patterns`: repeated themes that do not justify their own implementation slice.
- `## Duplicates And Superseded Findings`: rejected or merged findings and what absorbed them.
- `## Priority Ranking And Dependencies`: rank by impact, confidence, effort, blast radius, and prerequisites; identify the best first slices.
- `## Audit Log`: concise chronological log of batches, validation, and scope corrections.
- `## Completion Checklist`: explicit confirmation of every completion rule below.

## Completion Rules

Finish only when all are true:

- every identifiable subsystem has been inventoried and reviewed;
- every subsystem ends in `recommend` or `skip`;
- every accepted finding includes evidence, scope, risks, validation, and dependencies;
- duplicates and weak abstractions have been removed;
- priorities and dependencies are internally consistent;
- the artifact exists at `.agents/docs/audits/<YYYY-MM-DD>-completed.md` using the current UTC date;
- no repository files changed except that artifact.
