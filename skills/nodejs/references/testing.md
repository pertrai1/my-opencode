# Testing Node.js code

- Use the configured runner and supported Node version. Name the behavior, circumstance, and expected outcome; keep setup, action, and assertions clear.
- Reproduce the changed behavior with success and meaningful failure cases: rejection, invalid input, timeout, cancellation, partial writes, or dependency failure as applicable. Await assertions on promises so tests cannot pass before work finishes.
- Test observable outcomes: returned values, persisted state, outgoing calls/messages, and diagnostics when contractual. Do not force all five categories onto every function or mirror implementation details.
- For an API, cover the transport boundary and meaningful integration behavior. For a CLI, assert stdout/stderr and exit status; for a library, assert public exports, rejection contracts, and lack of import-time side effects. Do not introduce an API test harness for a script.
- Isolate fixture data and restore mocks/listeners/environment changes. Close servers, streams, workers, timers, and temporary resources even on failure. Use an ephemeral port when a real server is necessary.
- Mock external services at the existing boundary to exercise errors and delays deterministically. Do not reach paid services or production data in ordinary tests. Retain integration tests for behavior mocks cannot establish.

Adapted from [Node.js Best Practices, sections 2.8, 4.1–4.5, 4.10–4.13](https://github.com/goldbergyoni/nodebestpractices/blob/dc3d60c29d5483d9ea99cf261bbd6203516a2ba7/README.md),
by Yoni Goldberg and contributors; rewritten and qualified for task and runtime context.
Licensed under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See [provenance and changes](sources.md).
