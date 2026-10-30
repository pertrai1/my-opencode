---
name: nodejs
description: Use for code that runs on Node.js, including APIs, workers, CLIs, Node-targeted libraries, and build scripts, or Node server portions of mixed monorepos. Do not use for browser-only JavaScript, Angular components/templates, or other UI edits merely because package.json or Node-based tooling exists.
---

# Node.js development

Confirm the changed code runs on Node.js from entrypoints, imports, package scripts,
exports, deployment configuration, and nearby code. Identify the affected package
in a monorepo; keep browser and server boundaries explicit. If the runtime is
unclear, inspect callers and build targets before applying Node-specific advice.

Before editing, inspect local instructions, the nearest `package.json`, lockfile,
Node version pins/engines and CI runtime, `type`/exports, file extensions, relevant
`tsconfig`, framework version, and test commands. Distinguish an API/worker from a
CLI, library, or one-off script. Respect the supported Node version, CommonJS/ESM
and JavaScript/TypeScript choices, framework error semantics, and local conventions.
Do not migrate module systems, add frameworks, replace tools, or upgrade runtimes
as part of unrelated work. Report an unsupported runtime separately if relevant.

Read only references relevant to the task, combining them when boundaries overlap:

- Promises, callbacks, streams, event emitters, or error paths: [async and errors](references/async-and-errors.md)
- Untrusted input, config, secrets, queries, paths, or child processes: [security and validation](references/security-and-validation.md)
- Tests, regressions, mocks, or async cleanup: [testing](references/testing.md)
- Resource lifetimes, event-loop delays, concurrency, or cancellation: [runtime reliability](references/runtime-reliability.md)
- API boundaries, worker ownership, deployment, health checks, or service shutdown: [services and production](references/services-and-production.md); do not load it for ordinary CLI/library/script changes

For libraries, propagate errors to callers and leave process signals, exit policy,
and logging configuration to the host. For CLIs/scripts, preserve stdout contracts,
write diagnostics to stderr, and use a failing exit status for unsuccessful work.
Load service guidance for an executable only when it actually owns a long-running
service or the task explicitly concerns service deployment.

Follow repository instructions over these references. Verify version-sensitive
APIs against documentation for the project's runtime/framework. Run the narrowest
configured checks covering the change, including meaningful failure-path tests.
Report what changed, checks and outcomes, and remaining uncertainty.

The references are curated adaptations of Node.js Best Practices by Yoni Goldberg
and contributors. See [source and license notes](references/sources.md) for pinned
provenance, changes, and CC-BY-SA-4.0 terms.
