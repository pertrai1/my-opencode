---
name: frontend-a11y
description: Use for every frontend task that creates, changes, or reviews a user interface, including HTML, CSS, client-side JavaScript, components, forms, navigation, responsive layouts, visual design, accessibility audits, and browser-facing tests. Load this skill even when accessibility is not explicitly requested.
---

# Frontend Accessibility

Treat accessibility as a prerequisite for a working interface. Apply the local WCAG 2.2 AA guidance when building or reviewing browser-facing features.

## Start here

1. Read [A11Y.md](A11Y.md) before changing or reviewing frontend code.
2. Identify the target platform and the component or interaction being changed.
3. Read only the matching file in [the loading map](A11Y.md#21-loading-triggers), plus any template that the current delivery or decision requires.
4. For web work, also use `modern-web-guidance` first. Apply the stricter compatible requirement when the two sources overlap.

## Implementation and review

- Prefer semantic native HTML. Use ARIA only when native semantics cannot express the required interaction, and implement the complete relevant APG pattern.
- Preserve keyboard operation, visible focus, logical focus order, labels, accessible names, feedback, responsive reflow, and sufficient measured contrast.
- For images or media, resolve their purpose and alternatives with the user when the source material is insufficient; never invent an alternative from a filename.
- For existing code, report evidence-based violations with the severity model in `A11Y.md` and propose targeted fixes rather than unnecessary rewrites.
- Do not claim human, assistive-technology, visual, or browser verification that did not occur. Record unverified checks and the required human follow-up.

## Deliverables and exceptions

Follow the governance requirements in `A11Y.md` for accessibility decisions, accepted WCAG exceptions, and release evidence. Use the bundled files in `templates/` exactly when the triggering event applies; do not reconstruct their format from memory.

## Source and updates

This skill vendors [fecarrico/A11Y.md](https://github.com/fecarrico/A11Y.md) at commit `c516c1d947d94a08c40fa2a22684d56539d09660` under its MIT license. Review and deliberately merge upstream updates so local guidance remains reproducible across machines.
