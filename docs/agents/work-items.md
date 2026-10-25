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
Its `status`, `nextAction`, units, and history describe intake and explicit
inception transitions; they do not replace the execution checkpoint.
`progress.md` owns current execution state. `request.md` preserves the original
request. Record user-authorized scope changes in the
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
  "version": 2,
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
  "units": [],
  "inception": null,
  "nextAction": "...",
  "history": []
}
```

External trackers should be adapters that populate `source`, `relationships`, and evidence links. They must not be required by the core intake flow.

Version 1 records are still readable. `show`, `resume`, and `list` fill in `units: []` and `inception: null` when those fields are missing.

## AI-DLC inception

For an intent that is too large for one OpenSpec change, `/inception` runs the [AI-DLC](https://prod.d13rzhkk8cj2z0.amplifyapp.com/) Inception phase on the work item. The work item becomes the **intent**, and each approved **unit** becomes its own OpenSpec change.

```sh
node ~/.config/opencode/scripts/work-item.mjs init-inception <work-id>
node ~/.config/opencode/scripts/work-item.mjs add-unit <work-id> --name "Checkout" --story US-1 --depends-on u-cart
node ~/.config/opencode/scripts/work-item.mjs update-unit <work-id> u-checkout --story US-1 --story US-4
node ~/.config/opencode/scripts/work-item.mjs remove-unit <work-id> u-checkout
node ~/.config/opencode/scripts/work-item.mjs approve-inception <work-id> --by rob --note "Reviewed units"
node ~/.config/opencode/scripts/work-item.mjs link-unit <work-id> u-checkout --change add-checkout
```

| Command | Effect | Guard |
| --- | --- | --- |
| `snapshot-inception` | Returns content/mode fingerprints for all files under `.agents/work`, with the root and active work ID. | Read-only; fails on symbolic links or unreadable files. Compare before/after maps around delegation; unchanged pre-existing files are allowed. |
| `init-inception` | Scaffolds `inception/plan.md`, `stories.md`, `nfr.md`, `risks.md`, and `units.md`. Sets status to `inception`. | Never overwrites existing files. Fails after approval. |
| `add-unit` | Adds a `proposed` unit with stories and dependencies. | Requires `init-inception` first. Rejects duplicates, unknown dependencies, and changes after approval. |
| `update-unit` | Replaces a unit's `--summary`, `--story` list, or `--depends-on` list. `--clear-dependencies` empties the dependency list. | Before approval only. Rejects self-dependencies and dependency cycles. |
| `remove-unit` | Deletes a unit. | Before approval only. Refuses while another unit depends on it. |
| `approve-inception` | Marks every unit `approved`, records who approved it, and sets status to `inception-approved`. | Validates the artifacts first (see below). Only the orchestrator runs it, and only after explicit human approval. |
| `link-unit` | Sets the unit to `linked`, records its OpenSpec change name, and adds a relationship. | See the linking rules below. |

`approve-inception` reports every problem in one run and approves only when all of these hold:

- Each `## US-<n>:` heading in `stories.md` appears once.
- Every unit lists at least one story, and every story it lists exists in `stories.md`.
- Every story is assigned to exactly one unit.
- `units.md` has exactly one `## u-<slug>:` section per registered unit and none for unregistered units. Each section has a `Measurement criteria:` line and a `Suggested bolts:` line.

The `Stories:` and optional `Depends on:` lists in each unit section must match the registered unit as sets (order and surrounding whitespace are ignored). Duplicate list fields are rejected.

HTML comments in the templates are ignored.

`link-unit` keeps one unit per OpenSpec change:

- Linking a unit to the change it already has is a no-op. Linking it to a different change is rejected.
- A change that is already linked to another unit is rejected.
- Every `dependsOn` unit must be linked first. `--parallel --note "<who approved and why>"` overrides this and records the note in the history.
- `work-item.mjs` stays independent of OpenSpec, so it does not check that the change exists. The orchestrator confirms the change with `openspec show` before linking.

Inception transitions update `work.json` atomically, including unit status, relationships, history, and the lifecycle next action. They leave `progress.md` unchanged. Use `show`, `resume`, or `list` for lifecycle metadata, and read `progress.md` for the agent-maintained execution checkpoint. After a meaningful transition, the orchestrator updates that checkpoint using the protocol above, preserving acceptance criteria, evidence, blockers, and pending work.

`inception-author` writes the inception Markdown files and has no shell access. The orchestrator registers the units it proposes and checks that the agent edited only the active work item's inception folder.

## Scope of this slice

The CLI creates and resumes durable records and supports explicit intent-to-unit
inception transitions. Agents maintain execution checkpoints using the protocol
above. Domain modeling, bolt-level execution, tracker adapters, and the operations
phase are not implemented by this CLI. A completed checkpoint does not mutate the
lifecycle record or close an external issue.
