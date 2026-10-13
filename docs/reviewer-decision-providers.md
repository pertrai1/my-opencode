# Reviewer decision providers

This interface applies only to read-only reviewer selection. Automatic
agent/model routing and its Jev plugin are unchanged. Existing callers and an
unset `REVIEWER_DECISION_PROVIDER` retain the TypeSafe/Jev path, payload, six
questions, thresholds, 3-second timeout, and no retries.

## Select a provider

| `REVIEWER_DECISION_PROVIDER` | Behavior |
| --- | --- |
| `jev` (default) | Existing TypeSafe SDK path; requires the existing approved credential setup. |
| `off` | No provider construction or call; use manual reviewer selection. |
| `subq` | SubQ adapter; without an injected transport, returns `provider-unavailable` and manual fallback. |
| Anything else | `unknown-provider` diagnostic and manual fallback; no provider call. |

For example, run `REVIEWER_DECISION_PROVIDER=off node scripts/recommend-reviewers.mjs`
to use manual selection. The selector does not configure credentials. A provider
error or invalid answer never triggers another provider. No-change input still
returns `source: none`.

The new SubQ path is deliberately offline-first: this PR supplies an adapter and
mocked transport, not a live HTTP client or key lookup. A live pilot requires
separate approval of payload and budget before adding or invoking an authenticated
transport. Do not use the existing live baseline command to run this comparison.

## Request and result contract

`reviewerRequest(change)` produces the existing `{ state, questions }` request.
`state` contains `change` and the existing reviewer policy. `change` retains file
statuses/paths, diff statistics, and locally derived counts. There are no new
payload fields, raw diffs, prompts, images, or credentials. Paths may be sensitive;
the caller must approve sending metadata before enabling a live provider.

`selectReviewers(change, { provider, jevClient, subqTransport, now })` returns:

- `provider`, `status` (`ok`, `invalid`, `error`, or `off`), and `source`
  (`typesafe`, `subq`, or `fallback`).
- `recommendations` and `selectedReviewers`. Only a complete set of six valid
  answers can select reviewers; malformed answers discard the whole result.
- `diagnostic`: a bounded code and static manual-fallback message, without raw
  exception or service response text.
- `metadata`: model, reported token usage when valid, elapsed milliseconds, and
  `probabilityKind: noul-probability-of-yes`. Missing usage is unknown, not zero cost.

Jev's injected client implements `systemOne(request, options)`, as in SDK 0.6.0.
SubQ's injected transport accepts `{ method, url, body }` and the same timeout and
retry options, and returns `{ status, body }`. It must enforce those options.
The SubQ body adds only `model: subq-snap-preview`; the endpoint is
`POST https://api.subq.ai/v1/systemone`. No authorization header is created here.

Both adapters consume `noul`, a probability of yes in `[0, 1]`. Existing policy
selects at 0.75 and includes uncertain answers at 0.35. Sharing these thresholds
does not establish calibration equivalence. Choice/score confidence cannot
substitute for a noul answer. For compatibility, injected legacy Jev clients may
omit the answer's `type`; SubQ answers must declare `type: noul`.

Contract evidence checked on 2026-10-13: installed `@typesafe-ai/sdk` 0.6.0's
`dist/index.d.mts` and `dist/index.mjs`, and the official
[SubQ Decisions API](https://docs.subq.ai/endpoints/decisions-api/).

## Compare offline

Run `node scripts/compare-reviewer-providers.mjs` with no arguments. It accepts
only the checked-in synthetic fixtures and makes no provider, key, or network
access. Its API reuses the existing baseline fixture builder and label scoring.
The [checked-in report](reviewer-provider-comparison.md) is deterministic.

The report separates raw invalid/error rates and fallback frequency from
successful-response accuracy. It records matching input digests, excluded disputed
labels, common-success coverage, reported versus missing usage, synthetic timing,
and illustrative rate-based cost estimates. Scripted responses deliberately include failures and misses;
they validate the adapters and scoring, not model quality. Do not rank providers
or infer live latency, calibration, or spend from these fixtures.

The report explicitly uses illustrative USD-per-million input/output rates of
1/2 for Jev and 1/0 for SubQ; these are test assumptions, not vendor prices.
`compareProviders(fixtures, rates)` accepts replacement rates, or `{}` to leave
cost unknown. Estimates cover reported usage only, including invalid responses
that report usage; missing usage remains unpriced. No billing claim is made.
