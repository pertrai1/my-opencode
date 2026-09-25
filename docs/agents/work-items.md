# Work items

Work items are the tracker-neutral intake record for requests that need to survive a session. They are local by default, so a project does not need GitHub Issues or another external tracker to use the workflow.

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

HTML comments in the templates are ignored.

`link-unit` keeps one unit per OpenSpec change:

- Linking a unit to the change it already has is a no-op. Linking it to a different change is rejected.
- A change that is already linked to another unit is rejected.
- Every `dependsOn` unit must be linked first. `--parallel --note "<who approved and why>"` overrides this and records the note in the history.
- `work-item.mjs` stays independent of OpenSpec, so it does not check that the change exists. The orchestrator confirms the change with `openspec show` before linking.

Every state change rewrites `progress.md` from `work.json`, including a unit table once units exist. `work.json` is the source of truth, and both files are written through a temporary file and a rename.

`inception-author` writes the inception Markdown files and has no shell access. The orchestrator registers the units it proposes and checks that the agent edited only the active work item's inception folder.

## Scope of this slice

This slice creates and resumes the durable intake record and adds intent-to-unit inception. It does not yet implement domain modeling, bolt-level execution, tracker adapters, or the operations phase.
