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
node ~/.config/opencode/scripts/work-item.mjs approve-inception <work-id> --by rob --note "Reviewed units"
node ~/.config/opencode/scripts/work-item.mjs link-unit <work-id> u-checkout --change add-checkout
```

| Command | Effect | Guard |
| --- | --- | --- |
| `init-inception` | Scaffolds `inception/plan.md`, `stories.md`, `nfr.md`, `risks.md`, and `units.md`. Sets status to `inception`. | Never overwrites existing files. Fails after approval. |
| `add-unit` | Adds a `proposed` unit with stories and dependencies. | Requires `init-inception` first. Rejects duplicates, unknown dependencies, and changes after approval. |
| `approve-inception` | Marks every unit `approved`, records who approved it, and sets status to `inception-approved`. | Requires at least one unit. Only the orchestrator runs it, and only after explicit human approval. |
| `link-unit` | Sets the unit to `linked`, records its OpenSpec change name, and adds a relationship. | Requires approval and a valid change name. |

`inception-author` writes the inception Markdown files and can run `add-unit`. It cannot approve inception or link units.

## Scope of this slice

This slice creates and resumes the durable intake record and adds intent-to-unit inception. It does not yet implement domain modeling, bolt-level execution, tracker adapters, or the operations phase.
