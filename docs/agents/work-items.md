# Work items

Work items are the tracker-neutral intake record for requests that need to survive a session. They are local by default, so a project does not need GitHub Issues or another external tracker to use the workflow.

## When to track work

- A short answer or single mechanical edit needs no task list.
- For three or more meaningful steps or multiple deliverables, maintain a short
  session checklist with `todowrite`. Use a Markdown checklist if the tool is
  unavailable. Track outcomes, not every tool call.
- Before substantial work spanning files or stages, create a durable work item.
  Also persist work before a handoff or pause with unfinished steps or blockers.
  Reuse an active work item or the workflow's existing `progress.md`/`intent.md`;
  do not create parallel records for the same request.
- Read-only requests and restricted agents must not write tracking artifacts
  outside their authorized scope. Return a checkpoint to the owning session,
  or keep the checklist in the response and explain that it was not persisted.

`AGENTS.md` applies this policy to ordinary sessions. `opencode.jsonc` enables
`experimental.todo` and allows `todowrite` for lean. The session checklist is a
working view; the file checkpoint is the durable source for current execution
state. It does not depend on another session inheriting the original todo list.

## Create and resume

Create a local work item with:

```sh
node ~/.config/opencode/scripts/work-item.mjs create \
  --request "Add ellipsis behavior to the search input" \
  --type feature \
  --risk low \
  --route light-task \
  --acceptance "Long values are visually truncated"
```

The command creates `.agents/work/<work-id>/` containing `work.json`, `request.md`, and `progress.md`.

Resume or inspect a work item with:

```sh
node ~/.config/opencode/scripts/work-item.mjs resume <work-id>
node ~/.config/opencode/scripts/work-item.mjs list
```

`resume` currently returns `work.json` only. Before making decisions, also read
`.agents/work/<work-id>/progress.md` and relevant artifacts referenced there.
If the work ID is unknown, use `list`; ask which record to resume if more than
one matches. Reconstruct the session checklist from the checkpoint rather than
repeating completed work or treating an old intake `nextAction` as current.

## Checkpoints

`work.json` preserves intake identity, original scope, and routing metadata.
Its `status` and `nextAction` describe intake; the CLI does not update them as
execution proceeds. `progress.md` owns current execution state. `request.md`
preserves the original request. Record user-authorized scope changes in the
checkpoint and keep them distinguishable from the original acceptance criteria.
Existing workflow-specific `intent.md` remains the source for design decisions.

The create command seeds a minimal `progress.md`. Expand it before substantial
execution using these sections, or retain equivalent sections in an existing
workflow checkpoint:

```md
# Progress: <work-id>

Updated: <date>
Execution state: in progress

## Acceptance criteria

- [ ] <observable outcome>

## Steps

- [x] <completed step, with evidence below>
- [ ] <remaining step>

## Verification

- <command or check>: <passed, failed, blocked, or not run; result/evidence path>

## Blockers

- None, or <specific blocker and what resolves it>.

## Next action

<One concrete next step, or "None; verified work complete.">
```

Update the checkpoint after a meaningful step or verification result, when a
blocker appears or changes, and before handoff, manual compaction, or ending with
unfinished work. Keep unchecked steps and failed, blocked, or unrun checks visible.
Mark criteria complete only with evidence; if a step is cancelled, record why.
Mirror changes into `todowrite` when available. Keep the work ID and checkpoint
path in a handoff response so a fresh session can locate them.

After compaction, read the checkpoint again before continuing. Automatic
compaction can happen between checkpoints, so checkpoint regularly rather than
waiting for a context-limit warning. Reconcile the summary with files and test
results; compaction is not evidence that a pending step succeeded.

## WorkItem shape

`work.json` is intentionally independent of a tracker:

```json
{
  "version": 1,
  "id": "wi-20260925T120000Z-add-ellipsis-a1b2c3d4",
  "source": { "kind": "local", "ref": null },
  "request": "...",
  "type": "feature",
  "status": "new",
  "owner": "unassigned",
  "risk": "low",
  "route": "light-task",
  "acceptanceCriteria": [],
  "artifacts": [],
  "evidence": [],
  "relationships": [],
  "nextAction": "...",
  "history": []
}
```

External trackers should be adapters that populate `source`, `relationships`, and evidence links. They must not be required by the core intake flow.

## Scope of this slice

The CLI creates and resumes the durable intake record. Agents maintain execution
checkpoints using the protocol above. Automated lifecycle transitions, tracker
adapters, and route-specific execution are not implemented by this CLI. A completed
checkpoint does not mutate the intake record or close an external issue.
