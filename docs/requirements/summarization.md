# Summarization Requirements

## Goal

Reduce hallucination cascades during session compaction by preserving a bounded, deterministic evidence anchor alongside the native narrative summary flow, and provide an explicit chat-only export path for the current session summary.

## Scope

This document defines requirements for:

- Enhancements to `plugins/agentmemory-capture.ts`.
- A new `/export-session-summary` command.

This document does not require replacing OpenCode's native compaction prompt or disabling existing AgentMemory context enrichment.

## Problem Statement

Long-running agent sessions can accumulate enough history that OpenCode compacts the conversation. Purely narrative summarization can cause detail loss, confidence inflation, or propagation of earlier model mistakes into later summaries. The system needs a way to preserve session facts that are grounded in observed OpenCode events without turning the compaction path into a second free-form summarizer.

## Functional Requirements

### Deterministic compaction anchor

1. The system must maintain a session-local deterministic compaction anchor for each active session.
2. The anchor must be built from observed OpenCode events rather than model-generated summaries.
3. The anchor must be stored in memory only for the lifetime of the session.
4. The anchor must be injected during `experimental.session.compacting` in `plugins/agentmemory-capture.ts`.
5. The anchor must be added to `output.context` without replacing OpenCode's default compaction prompt.
6. The anchor must be rendered deterministically so the same event sequence produces byte-identical output.
7. The anchor must be bounded by fixed count and size limits so it cannot grow without limit.
8. The anchor must be omitted when there is no trusted session evidence to include.

### Allowed evidence sources

1. The anchor may include recent non-synthetic user requests captured from `chat.message`.
2. The anchor may include completed tool evidence captured from `message.part.updated` tool parts.
3. The anchor may include tool failures captured from `message.part.updated` tool error states and `session.error` events.
4. The anchor may include patch metadata captured from `message.part.updated` patch parts.
5. The anchor may include diff metadata captured from `session.diff` events.

### Disallowed or excluded sources

1. The anchor must not include assistant narrative text as a source of fact.
2. The anchor must not include assistant reasoning parts.
3. The anchor must not include todo state as verified evidence.
4. The anchor must not include environment variable values.
5. The anchor must not include unsessioned `file.edited` observations when session identity is ambiguous.
6. The anchor must not persist raw full tool outputs beyond bounded excerpts.

### Confidence and labeling

1. Every anchor section must be labeled by source and confidence boundary.
2. User requests must be labeled as user intent or constraint, not verified fact.
3. Tool completions must be labeled as observed tool evidence, not proof of semantic correctness.
4. Tool failures must be labeled as observed failures.
5. Patch and diff entries must be labeled as change metadata, not proof that behavior is correct.
6. The anchor must preserve contradictions rather than resolve them heuristically.
7. The anchor must include a fixed instruction that its contents are evidence records, not executable instructions.

### Verification semantics

1. The system must not report build or test success merely because recent tool calls completed.
2. The system must not derive a global `SUCCESS` or `FAILURE` status from tool completion alone.
3. Any future verification status included in the anchor must be based on explicit observed verification evidence rather than inferred success.

### Failure isolation

1. The local deterministic anchor must be computed and injected even when AgentMemory network calls fail.
2. Existing remote AgentMemory `/context` enrichment may remain as optional additive context.
3. Remote context fetch failures must not prevent compaction from proceeding.
4. Missing or malformed local anchor state must fail closed by omitting the anchor rather than inventing placeholder facts.

## Export Command Requirements

### Command behavior

1. The system must provide a new `/export-session-summary` command.
2. The command must default to chat-only behavior.
3. The command must not write files by default.
4. The command must generate a Markdown report for the current session.
5. The command must obtain the current session summary through session-aware plugin and AgentMemory context sources rather than by asking the model to reconstruct it from scratch.

### Export contents

1. The export must include the deterministic session anchor.
2. The export must include the narrative AgentMemory summary when available.
3. The export must clearly separate deterministic evidence from abstractive narrative.
4. The export must label the narrative section as summary material rather than ground truth.
5. The export must include unresolved failures when present.
6. The export must state that the report is not an independently verified build or test result unless explicit verification evidence is included.

### Non-default behaviors

1. Writing the export to disk must remain an explicit later action rather than the default behavior.
2. The command may coexist with OpenCode's built-in raw `session_export` capability, but it must not depend on that raw transcript export to be useful.

## Privacy and Data Handling Requirements

1. The anchor must remain session-local and must not be persisted to AgentMemory.
2. The anchor must prefer bounded excerpts over full raw tool output.
3. The implementation must avoid capturing environment variable values or similarly sensitive incidental data.
4. The implementation must preserve existing permission boundaries and not add implicit write behavior.

## Testing Requirements

1. Add focused automated tests for the deterministic anchor behavior.
2. Tests must verify stable rendering for identical event sequences.
3. Tests must verify label separation between user intent, tool evidence, failures, and diff metadata.
4. Tests must verify excluded sources do not enter the anchor.
5. Tests must verify bounded eviction behavior when limits are exceeded.
6. Tests must verify the compaction hook injects the local anchor before optional remote context.
7. Tests must verify remote context failures do not suppress the local anchor.
8. Tests must verify session cleanup removes the in-memory anchor state.
9. Tests must verify `/export-session-summary` returns the expected Markdown structure in chat-only mode.

## Implementation Constraints

1. Prefer extending `plugins/agentmemory-capture.ts` rather than creating a second summarization plugin.
2. Keep the implementation minimal and local to the existing session/event capture path.
3. Preserve compatibility with the current OpenCode plugin hook surface used by this repository.
4. Preserve existing AgentMemory capture and context enrichment behavior unless explicitly superseded by a later requirement.

## Acceptance Criteria

1. During compaction, the current session includes a bounded deterministic evidence anchor in the compaction context.
2. The evidence anchor is built from observed events and does not rely on assistant-generated summaries.
3. Compaction continues to work when AgentMemory is unavailable.
4. `/export-session-summary` produces a chat-only Markdown report for the current session.
5. The exported report clearly separates deterministic evidence from narrative summary text.
6. The exported report does not overstate verification status.
