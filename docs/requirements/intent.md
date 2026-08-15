# Summarization Enhancement Intent

## Goal

Mitigate hallucination cascades in long-running OpenCode sessions by pairing native narrative compaction with a bounded deterministic evidence anchor, and expose the current session report through a chat-only `/export-session-summary` command.

## Decisions

- Retain anchors only in memory for the active session; do not persist them to AgentMemory.
- Preserve OpenCode's default compaction prompt and append local anchor context before optional remote AgentMemory context.
- Treat user input as intent, tool lifecycle as observed evidence, and patch/diff records as change metadata; do not infer test or build success.
- Default export behavior is chat-only and must not write files.

## Evidence Anchors

- Requirements: `docs/requirements/summarization.md`.
- Plugin integration point: `plugins/agentmemory-capture.ts` (`experimental.session.compacting`).
- Type verifier: `npm run typecheck`.
- Test verifier: `npm test`.

## Slice 1 Contract

- Published declaration contract: `plugins/agentmemory-compaction-anchor.d.ts`.
- Contract checksum after Phase 0: `e1ff341cf3a1a0f7818c6e3c2099edf8cf6b9976`.
- Typecheck evidence: `npm run typecheck` passed after contract publication.

## Slice 1 RED Review

- Phase 1 attempt 1 was rejected because the authored JavaScript test invented event and compaction-output shapes that conflict with the declared OpenCode SDK and plugin hook types. The replacement test must use those public declaration shapes.
- Phase 1 attempt 2 uses public SDK event shapes and `context: string[]`; it is the checksum-locked RED test for implementation.

## Slice 1 GREEN Blocker

- The implementer subagent could not launch because its configured model, `openai/gpt-5.3-codex`, is unavailable in the current OpenCode installation.
- Three GREEN launch attempts failed before any implementation work began. The pipeline is halted rather than bypassing the implementer phase.
- The user corrected the implementer model to `openai/gpt-5.3-codex-spark`; Slice 1 GREEN may resume with the previously locked contract and RED test.
- The first resumed GREEN implementation was rejected: passing test labels alone did not prove tool/patch evidence capture, and independent inspection found event-handler control flow prevents that capture.
- RED is being strengthened before Slice 1 acceptance so the behavioral evidence validates actual retained entries, exclusions, bounds, and lifecycle cleanup rather than static renderer headings.
- The first strengthened-test attempt was rejected for an internally inconsistent expected evidence count; test ownership is returned to the test author.
- The corrected strengthened test is the locked RED artifact; it proves the current implementation loses the observed tool-state title.
- Revised GREEN preserves the public tool-state title and passes the full test suite, checksum gates, and static lint. Strict acceptance remains blocked solely on independent typecheck command authorization.
- On the resumed GREEN gate, contract and RED checksums remained locked; the required independent `npm run typecheck` was again denied before execution by shell policy.
- Continuation revalidated the locked checksums and passed the full 23-test suite. The independent typecheck remained denied before execution, so the pipeline remains at Slice 1's GREEN gate.
- A subsequent continuation again revalidated both locked checksums, but the required independent `npm run typecheck` command was denied before execution. Slice 1 is still blocked at GREEN and Slice 2 has not started.
- The independent Slice 1 GREEN gate subsequently passed: `npm run typecheck` and the full 23-test suite passed with the published contract and locked RED test checksums unchanged. Slice 1 is accepted.

## Slice 2 Contract

- Published declaration contract: `plugins/agentmemory-session-summary-export.d.ts`.
- Contract checksum after Phase 0: `1ff3b61473a81eae4414a439889eb4e5ea0130bf`.
- The contract separates session-local deterministic evidence from optional AgentMemory narrative material and requires a session-aware narrative provider rather than model reconstruction.

## Slice 2 RED

- Locked RED test: `tests/agentmemory-session-summary-export.test.js` (`1ac8fe19d66326856be8211af7b2cc39f6ef6d06`).
- It proves retrieval from the current-session provider, source-boundary labels, unresolved failure inclusion, unavailable-narrative fallback, the no-independent-verification disclaimer, and default no-write behavior.

## Slice 2 Contract Gap

- The first GREEN attempt passed mechanical checks but was rejected: the contract only described a formatter plus caller-supplied provider, not a plugin-owned current-session report path usable by the later chat-only command.
- Phase 0 must publish that operational boundary before RED/GREEN resume.
- Revised Phase 0 publishes explicit current-session and session-local-anchor provider boundaries plus a chat-only export result. The new locked contract checksum is `473c4e5649bad916aa8680eb6a54bd0fb632b1b1`; the prior RED test is superseded.

## Completion

- The live `export-session-summary` plugin tool binds retrieval to the tool execution session ID, uses only session-local anchor data plus optional AgentMemory context, and returns chat-only Markdown without filesystem writes.
- `commands/export-session-summary.md` forwards that tool output unchanged; it does not ask the model to reconstruct the report.
