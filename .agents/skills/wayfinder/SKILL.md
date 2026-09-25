---
name: wayfinder
description: Plan a huge chunk of work — more than one agent session can hold — as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
disable-model-invocation: true
---

Use this skill to plan work that spans multiple agent sessions. It tracks unresolved decisions as **decision tickets** on a **shared map** in the repository's issue tracker. Resolve tickets one at a time until the decisions needed before implementation are clear.

Define the **destination** for each effort before creating tickets. It can be a specification, a decision, or a change such as a data-structure migration. The map can track work in any domain.

## Plan, don't do

Wayfinder is for **planning** by default. Each ticket resolves a decision; finish when no decisions remain before implementation. If the effort's **Notes** explicitly include execution, the map may also track implementation. Otherwise, produce decisions, not deliverables.

## Refer by name

Every map and ticket has a title. In user-facing text and the map's Decisions-so-far section, refer to issues by title rather than by ID, number, or slug. Include the ID and URL in the title's link.

## The Map

The map is a single issue on this repo's issue tracker, labelled `wayfinder:map` — the canonical artifact. Its tickets are child issues of the map.

The map is an **index**. It lists resolved decisions and links to the tickets that contain their details. Keep each decision in its ticket; summarize it in one line on the map rather than repeating the full answer.

**Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific.** The issue tracker should have been provided to you — run `/setup-matt-pocock-skills` if not. Consult the tracker doc's "Wayfinding operations" section for how _this_ repo expresses them. If no tracker has been provided, default to the local-markdown tracker.

### The map body

The map is an overview to load once per session. It does not list open tickets; find them by querying the map's child issues.

```markdown
## Destination

<what reaching the end of this map looks like — the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [<closed ticket title>](link) — <one-line gist of the answer>

## Not yet specified

<!-- List in-scope questions that are not yet precise enough to become tickets. -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a **child issue** of the map. Its issue ID is its identity. Write one question in its body, scoped to one 100K-token agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries a `wayfinder:<type>` label — one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).

A session **claims** a ticket by assigning it to the dev driving the map, **first**, before any work, so concurrent sessions skip it. That assignee _is_ the claim: an open, unassigned ticket is unclaimed.

Use the tracker's **native** dependency relationship for blocking when available. This shows blocked and unblocked tickets in the tracker UI. Use a body convention only when the tracker lacks native blocking. A ticket is **unblocked** when every blocking ticket is closed. The **frontier** contains open, unblocked, unclaimed child tickets.

The answer isn't part of the body — it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.

## Ticket Types

Every ticket is either **HITL** — human in the loop, worked _with_ a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a `/research` **subagent**. Use when knowledge outside the current working directory is required.
- **Prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to — an outline, a rough take, a stub, or UI/logic code via the /prototype skill. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- **Grilling** (HITL): Conversation. The default case. Always invoke the /grilling and /domain-modeling skills.
- **Task** (HITL or AFK): Manual work that must happen before a _decision_ can be made — nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that _does_ rather than decides — and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.

## Not yet specified

The map can be incomplete. Put unresolved areas in **Not yet specified** when they depend on unanswered questions and cannot yet be written as precise tickets. When resolving a ticket clarifies one of these areas, create tickets for the questions that can now be stated.

Record each area as a short description of the suspected question or topic to revisit. These items are in scope but are not yet specific enough to become tickets.

**Not yet specified or ticket?** Decide based on whether you can state the question precisely, not whether you can answer it.

- **Ticket when** the question is already sharp — even if it's blocked and you can't act on it yet.
- **Not yet specified** when you cannot yet state the question precisely. Do not split an unclear area into tickets; resolving another question may reveal several tickets or none.

**Not yet specified** excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).

## Out of scope

The **destination** defines the scope. Record work excluded from this effort in **Out of scope**, not in **Not yet specified**.

If the destination changes to include excluded work, track it as a new effort.

If an existing ticket is outside the destination, **close it** and add a linked summary with the reason to **Out of scope**. Do not add it to **Decisions so far**, which records resolved decisions.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session** — with the exception of research tickets.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Run `/grilling` and `/domain-modeling` to identify the spec, decision, or change this effort must produce. The destination defines the scope.
2. **Map the open decisions.** Ask questions breadth-first across the problem instead of exploring one thread in depth. Identify unresolved decisions and steps the user can take now. If the work is clear and fits in one session, skip the map and ask how the user wants to proceed.
3. **Create the map** (label `wayfinder:map`): fill in Destination and Notes, leave Decisions-so-far empty, and list unclear in-scope areas in **Not yet specified**.
4. **Create tickets for questions you can state now** as child issues of the map. Add blocking relationships in a **second pass** because issues need IDs before they can reference each other. Leave questions you cannot yet state in **Not yet specified**.
5. **Run research subagents.** For each `research` ticket, start a `/research` subagent and resolve tickets in parallel. Put findings on a temporary `research/<name>` branch and include a context pointer from the ticket.
6. Stop. Map creation is one session's work; do not resolve tickets during this step.

### Work through the map

User invokes with a map (URL or number). A ticket is **optional** — without one, you pick the next decision, not the user.

1. Load the **map** — the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. **Claim it**: assign it to yourself before any work.
3. Resolve it — **zoom as needed**: fetch the full body of any related or closed ticket on demand; invoke the skills the `## Notes` block names. If in doubt, use `/grilling` and `/domain-modeling`.
4. Record the resolution: post the answer as a **resolution comment**, **close** the issue, and **append a context pointer** to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from **Not yet specified** so it lives only as its new ticket. If the answer reveals a ticket — this one or another — sits beyond the destination, **rule it out of scope** rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.

The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.
