# Services and production

- Apply this reference only to APIs, long-running workers, or explicit architecture/deployment tasks. Keep business decisions independent of HTTP request/response objects and infrastructure at existing boundaries. Do not impose three layers or microservices on a small script.
- Keep public error contracts and transport mapping explicit. Reuse the service's error handling and sanitized structured logs with request/job correlation. Do not require a new logger or observability vendor.
- Validate configuration before starting work. Respect the lockfile and configured package manager; use its reproducible install command in CI/deployment. Keep development, CI, and deployed runtime versions consistent; evaluate support status when changing deployment rather than silently upgrading.
- On shutdown, stop accepting new work, mark readiness appropriately, drain bounded in-flight work, and close dependencies with a deadline. Make repeated signals safe. Account for worker acknowledgements/retries and HTTP keepalive behavior supported by the installed runtime.
- Keep liveness distinct from readiness. An unavailable dependency should not automatically create an endless restart loop. After an uncaught programming fault, do not resume normal service as if state were trustworthy; follow the host's failure/restart policy.
- Let the deployment platform own replication, restart, log routing, and resource limits. Follow its existing signal and health contracts rather than adding a competing process manager. Keep container/runtime secrets outside images and build arguments.

Adapted from [Node.js Best Practices, sections 1.1–1.4, 2.4–2.6, 5.1–5.5, 5.14, 5.17–5.19, 8.6](https://github.com/goldbergyoni/nodebestpractices/blob/dc3d60c29d5483d9ea99cf261bbd6203516a2ba7/README.md),
by Yoni Goldberg and contributors; rewritten and qualified for task and runtime context.
Licensed under [CC-BY-SA-4.0](https://creativecommons.org/licenses/by-sa/4.0/).
See [provenance and changes](sources.md).
