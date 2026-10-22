# Local tool observations

First use case: find slow failed tools followed by repeated calls worth reviewing.
This default-off V2 plugin exports standard
[OTLP/HTTP JSON traces](https://opentelemetry.io/docs/specs/otlp/#json-protobuf-encoding)
to **127.0.0.1:4318/v1/traces only**. No credentials or hosted service are needed.
It observes calls without changing inputs, results, permissions, models or agents.

## Start capture

From this repository, with Docker already installed, start the official Collector:

```sh
docker run --rm --name opencode-tool-capture \
  --memory=128m --cpus=0.5 --pids-limit=64 \
  --log-driver=local --log-opt max-size=5m --log-opt max-file=2 \
  -p 127.0.0.1:4318:4318 \
  -v "$PWD/docs/telemetry/collector.yaml:/etc/otelcol/config.yaml:ro" \
  otel/opentelemetry-collector:0.137.0
```

This configuration exports only to local console logs. Docker retains at most two
5 MB rotated log files; `--rm` removes the container and logs when stopped. Stop
with Ctrl-C. The receiver listens on all interfaces **inside the container**;
keep the host port bound to `127.0.0.1`. For an existing native Collector, change
its receiver endpoint to `127.0.0.1:4318` before using this config directly.

In a second terminal, launch your V2 OpenCode with this repository installed as
its configuration (including `plugins/tool-observation.ts` and its sibling
`scripts/tool-observation.mjs`):

```sh
OPENCODE_TOOL_OBSERVATION=1 opencode
```

Restart OpenCode after adding the plugin. No config fields need changing if this
repository's `plugins/` directory is already your global plugin directory.
For a standalone checkout, the V2
[plugin loading instructions](https://dev.opencode.ai/v2/docs/build/plugins/)
describe project `.opencode/plugins/` and explicit plugin paths. This change does
not install files or edit your settings. Check `opencode --version` first: the
implementation typechecks against locked `@opencode/plugin` **2.0.12**; V1 is not
supported. Your installed runtime version has not been verified.

Unset `OPENCODE_TOOL_OBSERVATION` for subsequent processes to disable observation.
Do not set `OTEL_EXPORTER_OTLP_ENDPOINT` for this recipe: that independently enables
broader native runtime telemetry with a different payload/privacy surface.
No calls to models are needed to test this adapter:

```sh
node --test tests/tool-observation.test.mjs
```

## Read one useful diagnostic

The Collector prints `opencode.tool` spans with a random Trace ID, timestamps,
status, `opencode.tool.name`, `opencode.tool.outcome`, and
`opencode.tool.occurrence`. For example, two `shell` spans in one Trace ID with
occurrences 1 and 2, ERROR statuses and durations 8 s and 11 s identify **19 s
spent on failed shell calls** worth investigating in your local session. Duration
is end timestamp minus start timestamp. It includes time between before/after
hooks, potentially permission waits and other hook overhead, not pure CPU time.

Occurrence counts starts for the same allowlisted tool in the retained session.
It does **not** prove identical arguments, a retry, wasted work, or bad reasoning.
Unknown/custom tools are grouped as `other`, occurrence 0, so names cannot leak
paths or arbitrary text and unrelated custom tools are not presented as retries.
`error` means the hook reported an error or a completed `shell` (or legacy `bash`) result carried a
finite nonzero numeric `metadata.exit`. Output text is never parsed; textual-only
shell failures/cancellation and other domain failures can remain `completed`.
V2 `shell` and `subagent` names and legacy `bash` and `task` names are retained
as separate categories. A background tool return measures only the launch call;
its eventual job completion and failures are not observed.

## Privacy, bounds and missing data

No prompt, source, path, arguments, results, raw errors, agent/model names,
credentials, message IDs, call IDs or original session IDs are exported. Original
session/call IDs and tool names are retained only for bounded in-memory pairing. Each retained
session receives a random trace ID; spans have random IDs. These IDs correlate
activity within one retention window, and timestamps/tool categories expose work
patterns. They are not anonymous evidence suitable for unrestricted sharing.
There is no join to routing provenance or evals yet. A later explicitly designed
eval harness could retain the random trace ID with an eval outcome; no eval or
agent behavior is changed here.

- At most 128 pending calls/quarantined IDs, 128 session entries and 128 queued spans; 16 spans per
  export, one export at a time, checked every second. Queued overflow is dropped.
- Pending calls expire after ten minutes. Session counters/IDs reset after ten
  minutes idle, capacity eviction, plugin reload or process restart. Long-running
  tools can therefore be incomplete. IDs or tool names longer than 256 characters are dropped.
- Overlapping starts with a shared session/call ID (including CodeMode wrapper/
  children and same-tool overlaps) quarantine that ID until its original ten-minute
  expiry. All affected observations are dropped instead of guessing which end
  matches which start. `ambiguous` counts dropped starts, including the original;
  a mismatched terminal tool name also quarantines the original start. Duplicate
  starts are indistinguishable from overlapping calls and take the same path.
  Quarantine slots share the 128-entry pending limit; unrelated IDs still work.
- A fixed 500 ms request deadline, 4 KiB response limit, no retries, redirects,
  proxies, environment-derived headers or remote destination override. Outages
  lose observations without holding up tool callbacks. Cleanup aborts export and
  drops queued/pending work; abrupt process exit can lose the final batch.
- Resource attributes `opencode.observer.*` contain cumulative local counters:
  `overflow`, `incomplete`, `unmatched`, `ambiguous`, `invalid`, `exportFailed`, `rejected`,
  `shutdown`, and `sent`. Each batch snapshots counts **before that export**;
  delivery/rejection results appear in a later batch. Counts cover different
  stages and must not be summed as unique failed calls. If there is no later
  successful batch, final losses are unavailable remotely. `stats()` exposes
  counts locally for tests, not an OpenCode command.

This is not lifecycle/audit coverage: calls cancelled or denied without an after
hook expire as incomplete, not inferred errors. HTTP/WebSocket traffic and every
permission denial are not observed. Before-only hooks, duplicate deliveries and
process termination can leave gaps. Export failures do not emit raw errors.

## Why a small adapter

The inspected [native V2 exporter](https://github.com/anomalyco/opencode/blob/09a1db3b088293d48d84d62e86c02b69b40ed3ee/packages/util/src/observability/otlp.ts)
already exports logs/traces using `OTEL_EXPORTER_OTLP_ENDPOINT`. Prefer native
export for general runtime observability when its payload is acceptable.
The [tool implementation](https://github.com/anomalyco/opencode/blob/09a1db3b088293d48d84d62e86c02b69b40ed3ee/packages/core/src/tool.ts)
provides `Tool.execute` spans and before/after hooks, but no occurrence counter or
this closed metadata-only export contract. The adapter fills that narrow gap;
it does not install a global OTel provider or inherit native span context.
The old `experimental.openTelemetry` V1 setting is not used.

`scripts/routing-provenance.mjs` remains the existing routing record/sink. Its
asynchronous sink is appropriate for local routing logs but has no network queue
or concurrency bound, so the tool observer uses a dedicated bounded OTLP sender
without adding another routing pipeline.
