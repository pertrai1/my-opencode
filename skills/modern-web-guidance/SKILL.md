---
name: modern-web-guidance
description: |
  Search best-practice guides before choosing an unfamiliar web API, new UI pattern, compatibility fallback, or performance technique in HTML/CSS/client JS. Web APIs change faster than model training data.

  Typical triggers:
  - UI/Layout: Modals, dialogs, popovers, Glassmorphism/backdrop-filters, anchor positioning, container queries, `:has()`, `:user-valid`.
  - Scroll/Motion: View Transitions, Scroll-driven animations, scroll parallax/reveals.
  - Performance: CWV (LCP, INP), content-visibility, Fetch Priority, image optimization.
  - System/APIs: Local filesystem access, WebUSB, WebSockets sync, WebAssembly widgets.
  - Frameworks: Adapting layout/styles in React, Vue, Angular.
  - General Frontend: Forms, autofill, advanced inputs, custom scrollbars, modern component states, etc.

  Skip the lookup for a mechanical edit that keeps an inspected existing pattern and raises no new API or compatibility question.

  Not for backend (SQL, ORMs, Express routes), CI/CD, Docker, Actions, local scripts, ESLint, or Git.
---

# Modern Web Guidance

Vendored from [GoogleChrome/modern-web-guidance](https://github.com/GoogleChrome/modern-web-guidance/tree/b31dc0a43ff5d19bcf386a3476a216f3b39a6f55)
at commit `b31dc0a43ff5d19bcf386a3476a216f3b39a6f55` under the included
[Apache-2.0 license](LICENSE). Local changes: Markdown formatting, this
provenance notice, task-dependent research triggers with a mechanical-edit
exception, brief disclosure in the normal completion summary, and launcher
guidance restricted to the existing `npx -y modern-web-guidance@latest *` agent
allowance. The trigger and disclosure wording are local adaptations, not upstream
defaults. Permissions and browser-support rules are unchanged.

A skill to search for specific web development use cases and retrieve their corresponding best practice guides.

## When to use

Web APIs change faster than model training data, so a pattern that feels familiar
can still be outdated. Search before deciding on:

- an unfamiliar web API, a new UI pattern, or a performance technique;
- browser support, progressive enhancement, or fallback behavior;
- a new component without an established repository pattern, to check whether a standardized pattern exists and to avoid ad-hoc solutions or large dependencies;
- anything the user asks to check against current web guidance.

A mechanical edit that keeps an existing repository pattern you have inspected
(such as copy, spacing, or a rename) needs no lookup when it introduces no new API
or compatibility question. An existing pattern shows local convention, not current
best practice: if you are unsure it is still appropriate, search rather than treat
familiarity as evidence. This exception does not waive frontend accessibility
checks or the project's browser-support requirements.

## Usage Instructions

### Step 1. Search Use Cases

Search with an action-oriented query summarizing what you want to achieve using the `search` command. Run `modern-web-guidance` directly with `npx`.

```sh
npx -y modern-web-guidance@latest search "<query>" --skill-version 2026_10_12-dacb5911
```

**Example Output**:

```json
[
  {
    "id": "optimize-image-priority",
    "description": "Optimize the loading priority of Largest Contentful Paint (LCP) candidate images.",
    "category": "performance",
    "featuresUsed": [ "Fetch priority" ],
    "tokenCount": 985,
    "similarity": 0.7289
  },
  {
    "id": "defer-rendering-heavy-content",
    "description": "Reduce rendering times in content-heavy web pages by deferring rendering for offscreen content.",
    "category": "performance",
    "featuresUsed": [ "content-visibility", "hidden=\"until-found\"" ],
    "tokenCount": 1250,
    "similarity": 0.6961
  }
]
```

> **Note**: If search results are vague, return no matches, or show low similarity scores, run the `list` command to browse all guides:
>
> ```sh
> npx -y modern-web-guidance@latest list
> ```

---

### Step 2. Retrieve Best Practices

Once you have a relevant `id` from the search results, call this script using the `retrieve` command to get the full guide. You can pass multiple IDs separated by commas.

```sh
npx -y modern-web-guidance@latest retrieve "<id>"
```

If the output is truncated, you must repeat the command but redirect to a file and read that file.

**Example Output**:
`The markdown content of the guide describing implementation steps...`

---

### Step 3. Verify Guidance Compliance

When generating or modifying code, cross-check the implementation against the retrieved guide before concluding:

- **Applicable Guidance & Fallbacks**: Ensure the relevant modern patterns and necessary fallback strategies from the guide are correctly applied, without forcing unrequested features.
- **Task Fulfillment**: Confirm that the implementation fully satisfies the user's request.

### Step 4. Disclose Skill Usage

In the normal completion summary, name the retrieved guide IDs that shaped a
decision and the choice or fallback each one led to, so a reviewer can trace it.
Do not add a separate report section or quote every guide. If a lookup found
nothing applicable, say so only when that limits the result or explains a decision.

Never invent guide IDs, quotations, or successful lookups. After compaction,
retrieve a guide again before citing it. If a needed lookup is unavailable, report
that and what remains unverified.

## Using npx

- Use `npx -y modern-web-guidance@latest` for every lookup, including when `pnpm` is installed.
- Keep the existing narrow `npx -y modern-web-guidance@latest *` allowance. Do not broaden agent permissions or switch launchers to run this skill.
- Windows is outside this repository's supported skill-installation workflow.
- Fetching and running `modern-web-guidance` requires outbound network access. If running in a sandboxed, permission-gated, or approval-based environment (e.g., Codex, Claude Code), **proactively request approval/allowlisting for the command with network access BEFORE executing it the first time**, avoiding sandbox network timeouts.
- In sandboxed environments where `~/.npm` is read-only or restricted, set `NPM_CONFIG_CACHE=/tmp/npm-cache`.
- If offline or blocked, report the guidance lookup unavailable; do not switch to invocation flags outside the existing allowance.
- The `--skill-version` flag is used to determine if this SKILL.md is out of date. If it is, a warning message is logged to stderr.

## Guidelines

- When a lookup is needed, search **first** to find the most relevant guides.
- These guides are usually framework-agnostic; adapt them correctly to your setup.
- Do not hallucinate guides or ignore them; they represent the preferred local standard for the user's project.

## Interpreting Browser Support & Fallbacks

- **Default Behavior**: All guides assume **Baseline Widely available** features are safe to use without fallbacks. For features that are not Baseline widely available, you **MUST** follow the fallback recommendations in the guide, unless the user has specified a custom browser support policy.
- **Custom Policies**: If the user has already defined explicit browser support requirements, use the browser compatibility data in the guide to determine if a fallback can be safely ignored.
  - For Baseline YYYY targets, a feature satisfies this target if its "Baseline since" date is <= YYYY.
  - **Policy Examples**:
    - _"Do not implement feature fallbacks."_ (for exploratory prototypes of the cutting-edge web)
    - _"Safari 17.4+"_ (for internal tools targeting macOS or Tauri-based desktop apps)
    - _"Never recommend or implement polyfills; if a Baseline Newly Available feature is required for core functionality, provide a lightweight custom fallback or redesign the approach."_ (to minimize bundle size and avoid technical debt)
    - _"Assume a modern execution environment where Baseline Newly Available features can be used natively, provided they are strictly feature-detected and degrade gracefully."_ (for progressive enhancement strategies)
- **Reactive Policy Discovery**: Watch for environmental cues to suggest documenting a policy in CLAUDE.md or AGENTS.md. Suggest this if the developer:
  - Mentions building for a restricted runtime (e.g., Electron or Tauri).
  - Explicitly excludes specific targets (e.g., "we don't support Desktop Chrome").
  - Expresses hesitation about polyfill complexity, bundle size, or performance cost.
  - Questions if a feature is safe to use without fallbacks.

  No defined policy format. This is an example: `**Browser Support:** Allow Newly Available features, but only adopt custom fallback code that adds <= 20 lines and does not require external dependencies.`
