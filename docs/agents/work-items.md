# Work items

Work items are the tracker-neutral intake record for requests that need to survive a session. They are local by default, so a project does not need GitHub Issues or another external tracker to use the workflow.

## Create and resume

Create a local work item with:

```sh
node scripts/work-item.mjs create \
  --request "Add ellipsis behavior to the search input" \
  --type feature \
  --risk low \
  --route light-task \
  --acceptance "Long values are visually truncated"
```

The command creates `.agents/work/<work-id>/` containing `work.json`, `request.md`, and `progress.md`.

Resume or inspect a work item with:

```sh
node scripts/work-item.mjs resume <work-id>
node scripts/work-item.mjs list
```

## WorkItem shape

`work.json` is intentionally independent of a tracker:

```json
{
  "version": 1,
  "id": "wi-20260925T120000Z-add-ellipsis",
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

This slice creates and resumes the durable intake record. It does not yet implement lifecycle transitions, tracker adapters, or route-specific execution. Those should consume this record in later slices.
