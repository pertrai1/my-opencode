import { tool, type Hooks, type PluginInput } from "@opencode-ai/plugin";
import type { Event, FilePart, Todo } from "@opencode-ai/sdk";
import {
  CURRENT_SESSION_SUMMARY_EXPORT_TOOL_NAME,
  createCurrentSessionSummaryExportToolDefinition,
} from "./agentmemory-session-summary-export";

import {
  captureSessionCompactionAnchorChatMessage,
  captureSessionCompactionAnchorEvent,
  clearSessionCompactionAnchorSession,
  createSessionCompactionAnchorStore,
  injectSessionCompactionAnchor,
  renderSessionCompactionAnchor,
} from "./agentmemory-compaction-anchor";

const DEFAULT_API = "http://localhost:3111";
const DEFAULT_POST_TIMEOUT_MS = 5000;
const BACKGROUND_POST_TIMEOUT_MS = 30000;
const MAX_MESSAGE_PREVIEW = 2000;
const MAX_TOOL_INPUT_PREVIEW = 4000;
const MAX_TOOL_OUTPUT_PREVIEW = 8000;
const MAX_DIFFS_CAPTURED = 50;
const AUTO_CRYSTALS_AFTER_DAYS = 7;
const MAX_TODOS_CAPTURED = 100;
const MAX_SYSTEM_FILES = 10;
const MAX_PROMPT_FILES = 20;
const MAX_TRACKED_SUMMARY_SESSIONS = 32;

const API = process.env.AGENTMEMORY_URL ?? DEFAULT_API;
const FILE_TOOLS = new Set(["Read", "Write", "Edit", "Glob", "Grep"]);
const FILE_KEYS = ["filePath", "file_path", "path", "file", "pattern"];
const MAX_STASHED_FILES = 20;

const DEBUG = process.env.OPENCODE_AGENTMEMORY_DEBUG === "1";
const SECRET = process.env.AGENTMEMORY_SECRET ?? "";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (SECRET) headers["Authorization"] = `Bearer ${SECRET}`;
  return headers;
}

async function post(path: string, body: Record<string, unknown>, timeoutMs = DEFAULT_POST_TIMEOUT_MS): Promise<void> {
  try {
    await fetch(`${API}/agentmemory${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (DEBUG) {
      console.error("[agentmemory] POST failed", {
        path,
        message: extractErrorMessage(error),
      });
    }
  }
}

async function postJson(path: string, body: Record<string, unknown>): Promise<unknown | null> {
  try {
    const res = await fetch(`${API}/agentmemory${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_POST_TIMEOUT_MS),
    });
    return res.ok ? await res.json() : null;
  } catch (error) {
    if (DEBUG) {
      console.error("[agentmemory] POST failed", {
        path,
        message: extractErrorMessage(error),
      });
    }
    return null;
  }
}

async function observe(
  sessionId: string,
  hookType: string,
  data: Record<string, unknown>,
): Promise<void> {
  await post("/observe", {
    hookType,
    sessionId,
    project: projectPath,
    cwd: projectPath,
    timestamp: new Date().toISOString(),
    data,
  });
}

let activeSessionId: string | null = null;
let pendingConfig: Record<string, unknown> | null = null;
let projectPath: string | null = null;
const stashedFiles = new Map<string, Set<string>>();
const seenSubtaskIds = new Map<string, Set<string>>();
const seenToolCallIds = new Map<string, Set<string>>();
const contextInjectedSessions = new Set<string>();
const compactionAnchorStore = createSessionCompactionAnchorStore();
const sessionTitles = new Map<string, string | null>();
const trackedSummarySessions = new Map<string, number>();
// cache the context returned by POST /session/start so the chat
// system-transform hook can inject it without a second /context fetch.
// Auto-injection now happens at session.created (immediately) AND at
// the first prompt_submit (fallback for older OpenCode builds that
// don't implement experimental.chat.system.transform).
const startContextCache = new Map<string, string>();

function clearTrackedSessionState(sessionId: string): void {
  sessionTitles.delete(sessionId);
  startContextCache.delete(sessionId);
  pruneSessionMaps(sessionId);
  contextInjectedSessions.delete(sessionId);
  clearSessionCompactionAnchorSession(compactionAnchorStore, sessionId);
  trackedSummarySessions.delete(sessionId);
}

function touchTrackedSummarySession(sessionId: string): void {
  trackedSummarySessions.delete(sessionId);
  trackedSummarySessions.set(sessionId, Date.now());

  while (trackedSummarySessions.size > MAX_TRACKED_SUMMARY_SESSIONS) {
    const oldest = trackedSummarySessions.keys().next().value;
    if (typeof oldest !== "string") return;
    if (oldest === activeSessionId) {
      trackedSummarySessions.delete(oldest);
      trackedSummarySessions.set(oldest, Date.now());
      continue;
    }
    clearTrackedSessionState(oldest);
  }
}

function getSessionIdFromEvent(event: Event): string | null {
  const properties = getRecord((event as { properties?: unknown }).properties);
  if (!properties) return null;

  const part = getRecord(properties.part);
  if (typeof part?.sessionID === "string") return part.sessionID;
  if (typeof properties.sessionID === "string") return properties.sessionID;

  const info = getRecord(properties.info);
  if (typeof info?.id === "string") return info.id;
  if (typeof info?.sessionID === "string") return info.sessionID;

  return null;
}

async function getNarrativeSummaryForSession(sessionId: string): Promise<
  | {
      sessionId: string;
      source: "agentmemory-narrative-summary";
      markdown: string;
    }
  | {
      sessionId: string;
      source: "agentmemory-narrative-summary-unavailable";
      reason: "empty-context" | "http-error" | "transport-error";
    }
> {
  try {
    const response = await fetch(`${API}/agentmemory/context`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ sessionId, project: projectPath }),
      signal: AbortSignal.timeout(DEFAULT_POST_TIMEOUT_MS),
    });

    if (!response.ok) {
      if (DEBUG) {
        console.error("[agentmemory] POST failed", {
          path: "/context",
          message: `HTTP ${response.status}`,
        });
      }
      return {
        sessionId,
        source: "agentmemory-narrative-summary-unavailable",
        reason: "http-error",
      };
    }

    const result = await response.json();
    const context = getContext(result);
    if (!context) {
      return {
        sessionId,
        source: "agentmemory-narrative-summary-unavailable",
        reason: "empty-context",
      };
    }

    return {
      sessionId,
      source: "agentmemory-narrative-summary",
      markdown: context,
    };
  } catch (error) {
    if (DEBUG) {
      console.error("[agentmemory] POST failed", {
        path: "/context",
        message: extractErrorMessage(error),
      });
    }
    return {
      sessionId,
      source: "agentmemory-narrative-summary-unavailable",
      reason: "transport-error",
    };
  }
}

function buildCurrentSessionSummaryExportToolDefinition(sessionId: string) {
  return createCurrentSessionSummaryExportToolDefinition({
    currentSessionProvider: {
      async getCurrentSession() {
        return {
          sessionId,
          title: sessionTitles.get(sessionId) ?? null,
        };
      },
    },
    deterministicAnchorProvider: {
      async getDeterministicAnchorForSession(requestSessionId) {
        const markdown = renderSessionCompactionAnchor(compactionAnchorStore, requestSessionId) ?? "";

        const failures = compactionAnchorStore.getEvidence(requestSessionId).filter((entry) => {
          return entry.kind === "tool-failure" || entry.kind === "session-error";
        });

        const unresolvedFailuresMarkdown = failures.length > 0
          ? failures
              .map((entry) => {
                if (entry.kind === "session-error") {
                  return `- [observed failures] session-error: ${entry.errorExcerpt}`;
                }
                return `- [observed failures] ${entry.toolName} (${entry.callId}) failure=${entry.errorExcerpt} durationMs=${
                  entry.durationMs ?? "n/a"
                }`;
              })
              .join("\n")
          : null;

        return {
          sessionId: requestSessionId,
          source: "deterministic-session-anchor",
          markdown,
          unresolvedFailuresMarkdown:
            failures.length > 0
              ? `## Unresolved Failures\n${unresolvedFailuresMarkdown}`
              : null,
        };
      },
    },
    narrativeContextProvider: {
      async getNarrativeSummaryForSession(requestSessionId) {
        return getNarrativeSummaryForSession(requestSessionId);
      },
    },
  });
}

function stashFor(sid: string): Set<string> {
  let s = stashedFiles.get(sid);
  if (!s) { s = new Set<string>(); stashedFiles.set(sid, s); }
  return s;
}

function subtaskSetFor(sid: string): Set<string> {
  let s = seenSubtaskIds.get(sid);
  if (!s) { s = new Set<string>(); seenSubtaskIds.set(sid, s); }
  return s;
}

function toolCallSetFor(sid: string): Set<string> {
  let s = seenToolCallIds.get(sid);
  if (!s) { s = new Set<string>(); seenToolCallIds.set(sid, s); }
  return s;
}

function pruneSessionMaps(sid: string): void {
  stashedFiles.delete(sid);
  seenSubtaskIds.delete(sid);
  seenToolCallIds.delete(sid);
}

function safeSlice(v: unknown, max: number): string {
  if (typeof v === "string") return v.slice(0, max);
  if (v == null) return "";
  try { return JSON.stringify(v).slice(0, max); } catch { return ""; }
}

function getRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getContext(value: unknown): string | null {
  const record = getRecord(value);
  const context = record?.context;
  return typeof context === "string" && context.length > 0 ? context : null;
}

function getDurationMs(time: { created: number; completed?: number } | undefined): number | null {
  if (typeof time?.completed !== "number") return null;
  return time.completed - time.created;
}

function getToolTimes(time: unknown): { start: number | null; end: number | null } {
  const record = getRecord(time);
  return {
    start: typeof record?.start === "number" ? record.start : null,
    end: typeof record?.end === "number" ? record.end : null,
  };
}

function getToolDuration(state: { time?: unknown }): number | null {
  const { start, end } = getToolTimes(state.time);
  return start != null && end != null ? end - start : null;
}

function getFilePartName(part: FilePart): string | null {
  return part.filename ?? part.url ?? null;
}

function getTodoSummary(
  todos: ReadonlyArray<Todo>,
  status: "completed" | "active",
): Array<{ content: string; priority: string }> {
  return todos
    .filter(todo => status === "completed" ? todo.status === "completed" : todo.status !== "completed")
    .map(todo => ({ content: todo.content, priority: todo.priority }));
}

function getPartTypes(parts: ReadonlyArray<unknown>): string[] {
  return parts
    .map(part => getRecord(part)?.type)
    .filter((type): type is string => typeof type === "string" && type.length > 0);
}

function getPromptTextPart(part: unknown): string | null {
  const record = getRecord(part);
  if (!record || record.type !== "text" || record.synthetic || record.ignored) return null;
  return typeof record.text === "string" ? record.text : null;
}

function getPromptFilePart(part: unknown): string | null {
  const record = getRecord(part);
  if (!record || record.type !== "file") return null;
  if (typeof record.filename === "string" && record.filename.length > 0) return record.filename;
  return typeof record.url === "string" && record.url.length > 0 ? record.url : null;
}

const AGENTMEMORY_INSTRUCTIONS = `<agentmemory-instructions>
You have access to agentmemory for persistent cross-session memory. Use these tools proactively.

CORE TOOLS:

memory_save — Save an insight, decision, or fact to long-term memory.
  Required: content (text), concepts (2-5 comma-separated keywords), type (pattern/preference/architecture/bug/workflow/fact)
  Optional: files (comma-separated paths)
  Use when: user says "remember this", after discovering a bug, after making an architectural decision, after learning a project convention.

memory_recall — Search past observations by keywords.
  Use when: user says "recall", "what did we do", "do you remember", or needs context from past sessions.

memory_smart_search — Hybrid semantic+keyword search with progressive disclosure.
  Use when: you need the most relevant past context, fuzzy/conceptual searches, or recall doesn't find what you need.

memory_sessions — List recent sessions with status and observation counts.
  Use when: user asks about session/past history, "what did we work on".

memory_file_history — Get past observations about specific files (across all sessions).
  Use when: you're about to edit a file and want to know its history, common pitfalls, or past edits.

memory_lesson_save — Save a lesson learned (what worked, what to avoid).
  Use when: you discover a pattern that could help future sessions avoid mistakes.

memory_lesson_recall — Search lessons by query. Returns lessons sorted by confidence.
  Use when: before making a decision, check if past lessons apply.

memory_governance_delete — Delete specific memories. Requires explicit user confirmation.
  Use when: user says "forget this", "delete that memory".

memory_patterns — Detect recurring patterns across sessions.
  Use when: you want to understand project-level trends over time.

memory_consolidate — Run the 4-tier memory consolidation pipeline.
  Use when: you want to compress and organize accumulated session observations.

All memory tools start with \`agentmemory_memory_\`. Use the exact names as they appear in your tool list. Tool results are JSON. Always check what was returned before presenting to the user.
</agentmemory-instructions>`;

function extractFilePaths(args: Record<string, unknown>): string[] {
  const files: string[] = [];
  for (const key of FILE_KEYS) {
    const val = args[key];
    if (typeof val === "string" && val.length > 0) {
      files.push(val);
    }
  }
  return files;
}

function extractErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.message === "string") return e.message;
    if (e.data && typeof e.data === "object") {
      const d = e.data as Record<string, unknown>;
      if (typeof d.message === "string") return d.message;
    }
    if (typeof e.name === "string") return e.name;
    try { return JSON.stringify(err); } catch { return ""; }
  }
  return String(err ?? "");
}

export async function AgentmemoryCapture(ctx: PluginInput): Promise<Hooks> {
  projectPath = ctx.worktree ?? ctx.project?.id ?? process.cwd();

  return {
    event: async ({ event }: { event: Event }) => {
      const type = event.type;
      captureSessionCompactionAnchorEvent(compactionAnchorStore, event);
      const eventSessionId = getSessionIdFromEvent(event);
      if (eventSessionId) {
        touchTrackedSummarySession(eventSessionId);
      }

      // ── session.created ──
      if (type === "session.created") {
        const info = event.properties.info;
        activeSessionId = info.id;
        if (!activeSessionId) return;
        clearTrackedSessionState(activeSessionId);
        sessionTitles.set(activeSessionId, typeof info?.title === "string" ? info.title : null);
        touchTrackedSummarySession(activeSessionId);
        stashedFiles.set(activeSessionId, new Set());
        // Snapshot the session id locally — `activeSessionId` is mutable
        // and another `session.created` event during the await could
        // rebind it, causing context to be cached against the wrong key.
        const sessionId = activeSessionId;
        const startResult = await postJson("/session/start", {
          sessionId,
          title: info?.title ?? null,
          parentID: info?.parentID ?? null,
          version: info?.version ?? null,
          project: projectPath,
          cwd: projectPath,
        });
        // cache the context returned at session/start so the
        // chat.system.transform hook injects it without a second fetch.
        const startCtx = getContext(startResult);
        if (startCtx) {
          startContextCache.set(sessionId, startCtx);
        }
        if (pendingConfig) {
          await observe(sessionId, "config_loaded", pendingConfig);
          pendingConfig = null;
        }
      }

      // ── session.idle ── (summarize handled in session.status idle branch)

      // ── session.status ──
      if (type === "session.status") {
        const status = event.properties.status;
        const sid = event.properties.sessionID || activeSessionId;
        if (!sid || !status) return;
        if (status.type === "idle") {
          await post("/summarize", { sessionId: sid });
        }
        await observe(sid, "session_status", {
          status_type: status.type,
          attempt: "attempt" in status ? status.attempt : null,
          message: safeSlice("message" in status ? status.message : null, MAX_MESSAGE_PREVIEW),
        });
      }

      // ── session.compacted ──
      if (type === "session.compacted") {
        const sid = event.properties.sessionID || activeSessionId;
        if (sid) {
          await post("/summarize", { sessionId: sid });
          await observe(sid, "session_compacted", {});
        }
      }

      // ── session.updated ──
      if (type === "session.updated") {
        const info = event.properties.info;
        const sid = info.id || activeSessionId;
        if (!sid) return;
        if (typeof info.title === "string") {
          sessionTitles.set(sid, info.title);
        }
        touchTrackedSummarySession(sid);
        await observe(sid, "session_updated", {
          title: info?.title ?? null,
          parentID: info?.parentID ?? null,
          additions: info.summary?.additions ?? null,
          deletions: info.summary?.deletions ?? null,
          files: info.summary?.files ?? null,
        });
      }

      // ── session.diff ──
      if (type === "session.diff") {
        const sid = event.properties.sessionID || activeSessionId;
        if (!sid) return;
        const diffs = event.properties.diff;
        await observe(sid, "session_diff", {
          files: diffs.map(d => d.file),
          additions: diffs.reduce((sum, diff) => sum + (diff.additions ?? 0), 0),
          deletions: diffs.reduce((sum, diff) => sum + (diff.deletions ?? 0), 0),
          diffs: diffs.slice(0, MAX_DIFFS_CAPTURED),
        });
      }

      // ── session.deleted ──
      if (type === "session.deleted") {
        const sid = event.properties.info.id || activeSessionId;
        if (!sid) {
          if (DEBUG) console.error("[agentmemory] session.deleted with no session ID");
          return;
        }
        await post("/session/end", { sessionId: sid });
        void post("/crystals/auto", { olderThanDays: AUTO_CRYSTALS_AFTER_DAYS }, BACKGROUND_POST_TIMEOUT_MS);
        void post("/consolidate-pipeline", { tier: "all", force: true }, BACKGROUND_POST_TIMEOUT_MS);
        if (sid === activeSessionId) activeSessionId = null;
        clearTrackedSessionState(sid);
      }

      // ── session.error ──
      if (type === "session.error") {
        const sid = event.properties.sessionID || activeSessionId;
        if (sid) {
          await observe(sid, "post_tool_failure", {
            tool_name: "session.error",
            tool_input: "",
            tool_output: safeSlice(event.properties.error, MAX_TOOL_OUTPUT_PREVIEW),
          });
        }
      }

      // ── message.updated ──
      if (type === "message.updated") {
        const info = event.properties.info;

        if (info.role === "assistant") {
          const sid = info.sessionID || activeSessionId;
          if (!sid) return;
          const tokens = info.tokens;
          const error = info.error ? extractErrorMessage(info.error) : null;
          await observe(sid, "assistant_message", {
            messageID: info.id,
            parentID: info.parentID,
            modelID: info.modelID,
            providerID: info.providerID,
            mode: info.mode,
            cost: info.cost ?? 0,
            tokens: {
              input: tokens?.input ?? 0,
              output: tokens?.output ?? 0,
              reasoning: tokens?.reasoning ?? 0,
              cache_read: tokens?.cache?.read ?? 0,
              cache_write: tokens?.cache?.write ?? 0,
            },
            finish: info.finish ?? null,
            error,
            duration_ms: getDurationMs(info.time),
          });
        }
      }

      // ── message.removed ──
      if (type === "message.removed") {
        const sid = event.properties.sessionID || activeSessionId;
        if (sid) {
          await observe(sid, "message_removed", {
            messageID: event.properties.messageID,
          });
        }
      }

      // ── message.part.updated ──
      if (type === "message.part.updated") {
        const part = event.properties.part;
        const sid = part.sessionID || activeSessionId;
        if (!sid) return;

        if (part.type === "subtask") {
          const subtaskId = part.id;
          if (!subtaskId) return;
          const subtaskSet = subtaskSetFor(sid);
          if (subtaskSet.has(subtaskId)) return;
          subtaskSet.add(subtaskId);
          await observe(sid, "subagent_start", {
            subtask_id: part.id,
            agent: part.agent,
            prompt: safeSlice(part.prompt, 4000),
            description: safeSlice(part.description, 2000),
          });
          return;
        }

        if (part.type === "tool") {
          const state = part.state;
          if (!state) return;
          const callId = part.callID;
          if (!callId) return;
          const toolName = part.tool;

          if (state.status === "completed") {
            const callSet = toolCallSetFor(sid);
            if (callSet.has(callId)) return;
            callSet.add(callId);
            await observe(sid, "post_tool_use", {
              tool_name: toolName,
              call_id: callId,
              tool_input: safeSlice(state.input, MAX_TOOL_INPUT_PREVIEW),
              tool_output: safeSlice(state.output, MAX_TOOL_OUTPUT_PREVIEW),
              title: state.title ?? null,
              metadata: state.metadata ?? {},
              duration_ms: getToolDuration(state),
              attachments: Array.isArray(state.attachments)
                ? state.attachments.map(attachment => attachment.filename ?? attachment.url)
                : [],
            });
          } else if (state.status === "error") {
            const callSet = toolCallSetFor(sid);
            if (callSet.has(callId)) return;
            callSet.add(callId);
            await observe(sid, "post_tool_failure", {
              tool_name: toolName,
              call_id: callId,
              tool_input: safeSlice(state.input, MAX_TOOL_INPUT_PREVIEW),
              tool_output: safeSlice(state.error, MAX_TOOL_OUTPUT_PREVIEW),
              duration_ms: getToolDuration(state),
            });
          }
          return;
        }

        if (part.type === "step-finish") {
          await observe(sid, "step_finish", {
            messageID: part.messageID,
            reason: part.reason ?? null,
            cost: part.cost ?? 0,
            input_tokens: part.tokens.input ?? 0,
            output_tokens: part.tokens.output ?? 0,
            reasoning_tokens: part.tokens.reasoning ?? 0,
          });
          return;
        }

        if (part.type === "reasoning") {
          await observe(sid, "reasoning", {
            messageID: part.messageID,
            text: safeSlice(part.text, MAX_TOOL_INPUT_PREVIEW),
          });
          return;
        }

        if (part.type === "file") {
          const filename = getFilePartName(part);
          if (filename) stashFor(sid).add(filename);
          return;
        }

        if (part.type === "patch") {
          await observe(sid, "patch_applied", {
            messageID: part.messageID,
            hash: part.hash,
            files: part.files ?? [],
          });
          return;
        }

        if (part.type === "compaction") {
          await observe(sid, "compaction_event", {
            messageID: part.messageID,
            auto: part.auto ?? false,
          });
          return;
        }

        if (part.type === "agent") {
          await observe(sid, "agent_selected", {
            messageID: part.messageID,
            name: part.name,
          });
          return;
        }

        if (part.type === "retry") {
          await observe(sid, "retry_attempt", {
            messageID: part.messageID,
            attempt: part.attempt,
            error: safeSlice(part.error, MAX_MESSAGE_PREVIEW),
          });
          return;
        }
      }

      // ── file.edited ──
      if (type === "file.edited") {
        const sid = activeSessionId;
        if (sid && event.properties.file.length > 0) {
          const stash = stashFor(sid);
          stash.add(event.properties.file);
          if (stash.size > MAX_STASHED_FILES) {
            const keep = [...stash].slice(-MAX_STASHED_FILES);
            stash.clear();
            for (const f of keep) stash.add(f);
          }
        }
      }

      // ── permission.updated ──
      if (type === "permission.updated") {
        const sid = event.properties.sessionID || activeSessionId;
        if (!sid) return;
        await observe(sid, "notification", {
          notification_type: "permission_prompt",
          permission: event.properties.type ?? "unknown",
          pattern: Array.isArray(event.properties.pattern)
            ? event.properties.pattern.join(", ")
            : (event.properties.pattern ?? ""),
          tool_call_id: event.properties.callID ?? null,
          title: event.properties.title ?? event.properties.type ?? "",
          metadata: event.properties.metadata ?? {},
        });
      }

      // ── permission.replied ──
      if (type === "permission.replied") {
        const sid = event.properties.sessionID || activeSessionId;
        if (!sid) return;
        await observe(sid, "permission_replied", {
          permission_id: event.properties.permissionID ?? "",
          response: event.properties.response ?? "",
        });
      }

      // ── todo.updated ──
      if (type === "todo.updated") {
        const sid = event.properties.sessionID || activeSessionId;
        const todos = event.properties.todos.slice(0, MAX_TODOS_CAPTURED);
        if (!sid || todos.length === 0) return;
        await observe(sid, "task_completed", {
          completed: getTodoSummary(todos, "completed"),
          in_progress: getTodoSummary(todos, "active"),
          total: todos.length,
        });
      }

      // ── command.executed ──
      if (type === "command.executed") {
        const sid = event.properties.sessionID || activeSessionId;
        if (sid) {
          await observe(sid, "command_executed", {
            name: event.properties.name,
            arguments: event.properties.arguments ?? "",
          });
        }
      }

    },

    // ── chat.message ──
    "chat.message": async (input, output) => {
      captureSessionCompactionAnchorChatMessage(compactionAnchorStore, input, output);

      const sid = input.sessionID || activeSessionId;
      if (!sid) return;
      touchTrackedSummarySession(sid);
      const parts = output.parts ?? [];
      const files = parts
        .map(getPromptFilePart)
        .filter((file): file is string => typeof file === "string");
      for (const f of files) {
        const stash = stashFor(sid);
        stash.add(f);
        if (stash.size > MAX_STASHED_FILES) {
          const keep = [...stash].slice(-MAX_STASHED_FILES);
          stash.clear();
          for (const k of keep) stash.add(k);
        }
      }

      const userText = parts
        .map(getPromptTextPart)
        .filter((part): part is string => typeof part === "string")
        .join("\n");

      await observe(sid, "prompt_submit", {
        agent: input.agent ?? null,
        model: input.model ?? null,
        variant: input.variant ?? null,
        prompt: userText.slice(0, MAX_TOOL_OUTPUT_PREVIEW),
        files: files.slice(0, MAX_PROMPT_FILES),
        parts_summary: getPartTypes(parts),
      });
    },

    // ── tool: chat-only session summary export ──
    tool: {
      [CURRENT_SESSION_SUMMARY_EXPORT_TOOL_NAME]: tool({
        description: "Export the current session summary in chat format without writing files.",
        args: {
        },
        async execute(_, context) {
          const sid = context.sessionID;
          if (!sid) {
            return {
              title: "Current Session Summary",
              output: "## Current Session Summary\n\nSession summary export unavailable because no session context is available.",
              metadata: {
                destination: "chat",
                wroteFiles: false,
                sessionId: "unknown",
              },
            };
          }
          touchTrackedSummarySession(sid);
          const definition = buildCurrentSessionSummaryExportToolDefinition(sid);
          const result = await definition.execute({}, { sessionID: sid });
          return {
            title: result.title,
            output: result.output,
            metadata: result.metadata,
          };
        },
      }),
    },

    // ── chat.params ──
    "chat.params": async (input, output) => {
      if (!input.model || !output) return;
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;
      await observe(sid, "llm_params", {
        agent: input.agent,
        model: `${input.model.providerID}/${input.model.id}`,
        provider_url: input.model.api?.url ?? null,
        temperature: output.temperature,
        topP: output.topP,
        max_output_tokens: input.model.limit?.output ?? null,
        context_limit: input.model.limit?.context ?? null,
        cost_1k_input: input.model.cost?.input ?? 0,
        cost_1k_output: input.model.cost?.output ?? 0,
      });
    },

    // ── tool.execute.before ──
    "tool.execute.before": async (input, output) => {
      if (!FILE_TOOLS.has(input.tool)) return;
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;
      const args = output.args as Record<string, unknown> | undefined;
      if (!args) return;
      const stash = stashFor(sid);
      for (const fp of extractFilePaths(args)) {
        stash.add(fp);
      }
      if (stash.size > MAX_STASHED_FILES) {
        const keep = [...stash].slice(-MAX_STASHED_FILES);
        stash.clear();
        for (const f of keep) stash.add(f);
      }
    },

    // ── experimental.chat.system.transform ──
    "experimental.chat.system.transform": async (input, output) => {
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;

      if (!contextInjectedSessions.has(sid)) {
        if (!Array.isArray(output.system)) return;
        output.system.push(AGENTMEMORY_INSTRUCTIONS);
        // prefer the context already fetched at session.created;
        // fall back to a fresh /context call if the cache missed (e.g.
        // session resumed across plugin reloads).
        let ctx = startContextCache.get(sid);
        if (typeof ctx !== "string" || ctx.length === 0) {
          const result = await postJson("/context", {
            sessionId: sid,
            project: projectPath,
          });
          ctx = getContext(result) ?? undefined;
        } else {
          startContextCache.delete(sid);
        }
        if (typeof ctx === "string" && ctx.length > 0) {
          output.system.push(ctx);
        }
        contextInjectedSessions.add(sid);
      }

      const stash = stashFor(sid);
      if (stash.size === 0) return;
      const files = [...stash].slice(0, MAX_SYSTEM_FILES);

      const enrichResult = await postJson("/enrich", {
        sessionId: sid,
        files,
        toolName: "enrich_inject",
      });

      const enrichCtx = getContext(enrichResult);
      if (enrichCtx) {
        if (Array.isArray(output.system)) {
          output.system.push(enrichCtx);
        }
        for (const f of files) stash.delete(f);
      }
    },

    // ── experimental.session.compacting (WIP) ──
    "experimental.session.compacting": async (input, output) => {
      const sid = input.sessionID || activeSessionId;
      if (!sid) return;
      touchTrackedSummarySession(sid);

      injectSessionCompactionAnchor(compactionAnchorStore, sid, output);

      const result = await postJson("/context", {
        sessionId: sid,
        project: projectPath,
      });
      const ctx = getContext(result);
      if (ctx) {
        if (Array.isArray(output.context)) {
          output.context.push(ctx);
        }
      }
    },

    // ── config ──
    config: async (input) => {
      const payload: Record<string, unknown> = {
        theme: input.theme ?? null,
        model: input.model ?? null,
        autoupdate: input.autoupdate ?? null,
        agents: typeof input.agent === "object" && input.agent !== null && !Array.isArray(input.agent)
          ? Object.keys(input.agent as Record<string, unknown>)
          : Array.isArray(input.agent) ? input.agent : [],
        mcp_servers: typeof input.mcp === "object" && input.mcp !== null && !Array.isArray(input.mcp)
          ? Object.keys(input.mcp as Record<string, unknown>)
          : Array.isArray(input.mcp) ? input.mcp : [],
        providers: typeof input.provider === "object" && input.provider !== null && !Array.isArray(input.provider)
          ? Object.keys(input.provider as Record<string, unknown>)
          : Array.isArray(input.provider) ? input.provider : [],
        permission: input.permission ?? null,
      };
      if (activeSessionId) {
        await observe(activeSessionId, "config_loaded", payload);
      } else {
        pendingConfig = payload;
      }
    },
  };
}
