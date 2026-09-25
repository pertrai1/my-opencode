# Accessibility & the Agentic Web

> **Scope:** How AI agents that operate interfaces — browser agents, computer-use models — consume pages; where that overlaps with human accessibility, where it diverges, and the two traps. Non-normative context, except where it points at core rules.

## 0. The claim, in the right order

This standard is built for people. It turns out the same layer is what agents operate through: the dominant agent architectures read the **accessibility tree** — the same roles, names and states that serve a screen reader — because it is an order of magnitude cheaper than pixels. The order of the argument is not negotiable: *we need this for people, and agents benefit from it too.* An interface made "agent-readable" while people with disabilities cannot use it has failed both audiences and this standard.

## 1. What agents actually read

- Browser agents and computer-use models converge on **AXTree + DOM hybrids**; agent frameworks describe pages to the model through accessibility-tree snapshots, and vendors document that ARIA labels and roles are what their agents consume.
- The controlled evidence: pages with semantic HTML, accessible names and structured data nearly **doubled agent task success (≈89% vs ≈49%)** while cutting steps — the same markup this standard already mandates.
- The overlap is the core of this file: native semantics, accessible names, programmatic states, landmarks, keyboard operability. **Every core rule that feeds the accessibility tree feeds the agent.** There is nothing extra to generate.

## 2. Where human and agent needs diverge

- **Agents do not need** the perceptual layer: contrast, target size, reduced motion, captions, font floors. Those rules exist for people and are not relaxed because an agent is indifferent to them — people come first, always.
- **Agents need things accessibility does not define:** action contracts (what a control *does*, its preconditions and effects — the emerging WebMCP layer), stable identifiers, machine-readable data. That is an **additional** layer on top of the accessible interface, never a replacement for it.

## 3. The two traps (these are rules)

- **Redundant ARIA** — adding ARIA to look "agent-friendly" violates [*Avoid Redundant ARIA*](../A11Y.md) (core §6): agents read the same tree as assistive technology, and field data shows pages with more ARIA carrying **more** detected errors. The First Rule of ARIA still applies.
- **Parallel machine-facing content** — a separate "agent view" or flattened copy is an anti-pattern in core §6 (*Separate Machine-Facing Content*): versions can drift, and flattened content removes structure assistive technology needs. Use one canonical, accessible interface.

## 4. Collateral damage to watch

Anti-bot walls and CAPTCHAs increasingly misclassify assistive-technology users as automation. If the product blocks agents — a legitimate choice — verify the accessible path still works for people: the blocking mechanism cannot tell a screen reader's usage pattern from a bot's.

*The evidence behind this guide (agent architectures, the controlled study, the community positions) is compiled in the project's research notes; the standard's own benchmark measures the human side.*
