---
description: Export the current session summary to chat using live session evidence
---

Generate a deterministic, session-aware summary report for the current session.

## Usage

```text
/export-session-summary
```

## Instructions

1. Invoke the `export-session-summary` tool with **no arguments** for the current session.
2. If the tool errors or returns an empty/non-string result, respond with plain failure text (example: `Unable to export the current session summary at this time.`).
3. On success, return exactly the `output` field from the tool result and nothing else (do not paraphrase, shorten, or reconstruct the report).
4. Do not request or perform any file writes; this command is chat-only.
