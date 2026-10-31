# Runtime reliability

- Avoid blocking the event loop in request or concurrent-work paths. Bound large parsing, loops, and synchronous I/O; measure before introducing workers or changing architecture. Synchronous startup or small one-off CLI work can be appropriate.
- Bound concurrency and queue sizes. `Promise.all` over an unbounded input can exhaust sockets or memory; account for in-flight work when one task fails.
- Apply timeouts and cancellation using APIs supported by the project's Node version: `AbortController` on Node 15.0+/14.17+ and `AbortSignal.timeout()` on Node 17.3+/16.14+, where the receiving operation supports a signal. A `Promise.race` timeout does not cancel the losing operation: propagate cancellation and release resources explicitly.
- Respect stream backpressure and await completion; avoid buffering unbounded input/output. Handle early close, aborted clients, and partial files according to the output contract.
- Pair resource acquisition with cleanup on success and failure. Avoid network/database startup as a side effect of importing reusable code; expose explicit initialization and disposal.
- For CLIs, preserve machine-readable stdout, use stderr for diagnostics, and set a nonzero `process.exitCode` on failure while allowing pending output and cleanup to finish. Do not abruptly call `process.exit()` before writes complete. Libraries must not terminate the host process.
- Read service guidance only for a process that owns a service lifecycle; routine library/script changes do not need health endpoints, supervisors, or deployment configuration.

Adapted from [Node.js Best Practices, sections 2.13, 3.13, 5.10, 7.1, 8.6–8.7](https://github.com/goldbergyoni/nodebestpractices/blob/dc3d60c29d5483d9ea99cf261bbd6203516a2ba7/README.md),
by Yoni Goldberg and contributors; rewritten and qualified for task and runtime context.
Licensed under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See [provenance and changes](sources.md).
