# Async and errors

- Await or return asynchronous work so its caller owns completion and failure. Handle deliberately detached tasks explicitly; `void` alone does not handle rejection.
- Use `try`/`catch` around awaited operations at a boundary that can recover, translate, or add context. Use `return await` inside a `try` when its `catch` must observe rejection or `finally` must run after completion; do not mechanically rewrite every promise return.
- Throw `Error` instances; preserve causes and useful context without leaking secrets. Distinguish expected operational failures from programming faults. Do not catch and silently return success.
- Follow the installed framework's async error propagation rules; verify its version before assuming rejected route handlers are forwarded. Keep HTTP response mapping at the transport boundary.
- Handle EventEmitter `error` events and asynchronous listener rejections explicitly. A surrounding synchronous `try` does not catch later emitted errors. Prefer an awaited stream pipeline when suitable, preserving backpressure and handling cancellation and partial output.
- Treat unhandled rejections as defects. Modern Node's default rejection behavior can terminate the process, and flags/listeners change it; do not repeat the upstream claim that rejections are always swallowed. A global handler is not a substitute for local ownership or permission to continue after an uncaught exception.
- Keep process-level failure policy in executable startup, never in an imported library. Test rejected promises, stream failures, and cleanup as relevant.

Adapted from [Node.js Best Practices, sections 2.1–2.4, 2.6–2.8, 2.10–2.13](https://github.com/goldbergyoni/nodebestpractices/blob/dc3d60c29d5483d9ea99cf261bbd6203516a2ba7/README.md),
by Yoni Goldberg and contributors; rewritten and qualified for task and runtime context.
Licensed under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See [provenance and changes](sources.md).
