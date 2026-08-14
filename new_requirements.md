## 🔍 Overview
Implement core protective rails to guard the agent's context window from pollution and prevent runaway API token costs caused by infinite execution loops. 

This requirement consists of two primary mechanisms:
1. **Output Size Truncation:** Limit the maximum length of tool outputs injected into the LLM context.
2. **Doom Loop Detection:** Identify and break repetitive cycles of identical tool calls.

---

## 🎯 Functional Requirements

### 1. Output Size Truncation
* **Truncation Limits:** Any custom tool output or shell command stdout/stderr exceeding a combined limit of **30,000 Unicode characters** (evaluated post-execution on the combined output string) must be truncated.
* **Truncation Strategy (Head-and-Tail):** To ensure critical execution summaries and stack traces (which are typically at the end of shell outputs) are preserved, implement a head-and-tail truncation strategy. Show the first **20,000 characters** and the last **10,000 characters**.
* **UI Indicator:** Inject a prominent warning marker in place of the omitted middle content:
  ```
  \n[WARNING: Output truncated at 30,000 characters. Showing first 20,000 and last 10,000 characters. Full output saved to <path>.]\n
  ```
  The warning indicator text itself does not count against the 30k character budget.
* **Artifact Persistence & Security:** 
  * The complete, untruncated raw output must be written to a secure per-user directory (defaulting to `~/.opencode/tmp/`) with restrictive permissions (`0700` for directory, `0600` for files) to prevent unauthorized read access on shared machines.
  * To avoid filename collisions, the file naming format must use a session ID, timestamp, and random suffix: `opencode-full-out-<session_id>-<timestamp>-<random_suffix>.txt`.
  * **Retention & Cleanup:** Retained files in the tmp directory must be automatically pruned after 24 hours, or when the directory size exceeds a configurable limit (default: 100MB).

### 2. Doom Loop Detection
* **Stateful Ring-Buffer:** Maintain a rolling history of the last **5 tool calls** in a memory buffer.
* **Scope of Tracking:** Only track mutating, execution, or cost-incurring tools (e.g. terminal commands, file modifications, custom APIs). Safe/read-only tools (e.g. `read_file`, `search_files`) are exempt from tracking.
* **Stable Hash Comparison:** For each tracked call, generate a comparison hash based on:
  * `tool_name`
  * Serialized arguments (using a deterministic canonical JSON stringify to ensure alphabetical sorting of keys)
  * **Outcome Comparison:** To prevent false positives on legitimate polling (e.g., calling `git status`, checking progress bar, or waiting for a build to finish where the command succeeds but returns changing content), a call is only flagged as repetitive if its returned output hash is identical to its previous invocation, or if it returns the exact same execution failure.
* **Break Criteria (Windowed Repetition):** Instead of simple consecutive execution, a doom loop is triggered if **any unique tool call hash occurs 3 or more times within the 5-entry rolling window** (detecting both consecutive loops `A-A-A` and oscillating patterns like `A-B-A-B-A`).
* **Escalation Path:** 
  * **Action:** Upon loop detection, abort execution, log a descriptive warning to the user, and drop the agent into a **hard error** (default) or a configurable **interactive pause** (if supported by the host TUI/CLI environment).
  * **Reset Behavior:** Immediately upon breaking a loop, clear/reset the rolling history buffer to prevent the agent from immediately re-tripping the detection upon subsequent retry or user override.
* **Persistence Scope:** The rolling buffer persists for the lifetime of a single **agent execution session** (the current task run). It does not persist across different user-initiated tasks, and is fully reset when a new user message is received.

### 3. Configuration (`opencode.jsonc`)
These limits and strategies must not be hardcoded. They should be customizable in `opencode.jsonc` under the following schema:
```jsonc
"safety": {
  "truncation": {
    "maxLength": 30000,
    "headLength": 20000,
    "tailLength": 10000,
    "tempDir": "~/.opencode/tmp",
    "retentionHours": 24,
    "maxTempDirSizeMB": 100
  },
  "doomLoop": {
    "enabled": true,
    "bufferSize": 5,
    "maxRepetitions": 3,
    "exemptTools": ["read_file", "search_files"],
    "postAbortAction": "hard_error" // "hard_error" | "interactive_pause"
  }
}
```

---

## 📋 Acceptance Criteria
* [ ] Tool outputs over 30,000 characters are safely truncated using a 20k head / 10k tail split.
* [ ] A warning message is injected between the head and tail, pointing to the secure persistent raw file.
* [ ] Persistent raw files are stored in `~/.opencode/tmp/` with `0600` permissions and pruned after 24 hours / 100MB limit.
* [ ] Tool hash ring-buffer tracks calls dynamically using canonical JSON argument sorting.
* [ ] Ring buffer only tracks execution/mutating tools, exempting read-only/safe tools.
* [ ] Loop detection uses a 5-entry window to successfully catch both consecutive (`A-A-A`) and alternating (`A-B-A-B-A`) repetitive calls where request arguments and outcome hashes are identical.
* [ ] Loop detection successfully ignores legitimate polling where command outputs change.
* [ ] Upon loop identification, the current execution is aborted with a clear diagnostic message, returning a hard error or prompting an interactive pause.
* [ ] The tool hash buffer is cleared immediately after a loop is aborted to prevent immediate re-tripping on retry.
* [ ] All limits, paths, and behaviors are configurable via `opencode.jsonc`.
* [ ] Complete test suite verifying loop detection (consecutive, alternating, and polling cases), security permissions, truncation strategies, and config overrides passes.
