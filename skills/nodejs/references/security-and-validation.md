# Security and validation

- Validate external data at its boundary: types, ranges, lengths, allowed fields, and semantic constraints. TypeScript types do not validate JSON at runtime. Reuse the project's validator; validate required configuration before accepting work without printing secret values.
- Use parameterized queries and allowlisted query fields/operators. An ORM does not make raw queries or arbitrary user-supplied objects safe. Keep authorization distinct from schema validation.
- Avoid evaluating input or using it as a module path. Prefer `execFile`/`spawn` with separate arguments and shell disabled; validate executable/options too, since argument injection remains possible. Bound child-process output and execution time.
- Constrain filesystem access to the intended root, considering traversal and symlinks. For URL fetching, constrain destinations, redirects, protocols, response sizes, and timeouts according to the threat model.
- Keep secrets outside source, logs, client responses, and published package contents. Return stable public errors; retain sanitized diagnostic context internally.
- For HTTP tasks, enforce payload limits, authorization, appropriate headers, safe redirects, and rate limits using the existing stack. Do not add HTTP middleware to a CLI or library with no HTTP boundary.
- Bound expensive regular expressions and untrusted input sizes. Add focused abuse/failure tests for the boundary being changed; do not replace the application's security stack as an incidental cleanup.

Adapted from [Node.js Best Practices, sections 1.4, 2.11, 6.3–6.4, 6.10, 6.14–6.20, 6.24–6.25](https://github.com/goldbergyoni/nodebestpractices/blob/dc3d60c29d5483d9ea99cf261bbd6203516a2ba7/README.md),
by Yoni Goldberg and contributors; rewritten and qualified for task and runtime context.
Licensed under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See [provenance and changes](sources.md).
