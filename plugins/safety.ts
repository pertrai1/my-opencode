import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";

type SafetyConfig = {
  truncation: {
    maxLength: number;
    headLength: number;
    tailLength: number;
    tempDir: string;
    retentionHours: number;
    maxTempDirSizeMB: number;
  };
  doomLoop: {
    enabled: boolean;
    bufferSize: number;
    maxRepetitions: number;
    exemptTools: string[];
  };
};

type SafetyPluginOptions = Partial<{
  truncation: Partial<SafetyConfig["truncation"]>;
  doomLoop: Partial<SafetyConfig["doomLoop"]>;
}>;

// Stateful memory buffer for Doom Loop Detection
// Maps sessionID -> array of tool call hashes (rolling history)
const sessionBuffers = new Map<string, string[]>();
const MAX_TRACKED_SESSIONS = 1000;

// Default safety configuration
const DEFAULT_CONFIG: SafetyConfig = {
  truncation: {
    maxLength: 30000,
    headLength: 20000,
    tailLength: 10000,
    tempDir: "~/.opencode/tmp",
    retentionHours: 24,
    maxTempDirSizeMB: 100,
  },
  doomLoop: {
    enabled: true,
    bufferSize: 5,
    maxRepetitions: 3,
    exemptTools: ["read", "grep", "glob"],
  },
};

const TRACKED_TOOL_NAMES = new Set([
  "apply_patch",
  "bash",
  "edit",
  "question",
  "task",
  "webfetch",
  "write",
]);

const ARTIFACT_PREFIX = "opencode-full-out-";
const ARTIFACT_SUFFIX = ".txt";
const ARTIFACT_CREATION_ATTEMPTS = 5;
const MAX_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MIN_CLEANUP_INTERVAL_MS = 1000;
const REDACTED_VALUE = "[REDACTED]";

// Helper: resolve paths starting with ~/
function resolvePath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  if (p === "~") {
    return os.homedir();
  }
  return path.resolve(p);
}

function sanitizeFilenameComponent(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return sanitized.length > 0 ? sanitized : "unknown";
}

function redactSensitiveOutput(value: string): string {
  return value
    .replace(
      /(authorization\s*:\s*(?:bearer|basic)\s+)[^\s"'`]+/gi,
      `$1${REDACTED_VALUE}`,
    )
    .replace(
      /((?:api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?)[^\s"',`]+/gi,
      `$1${REDACTED_VALUE}`,
    )
    .replace(
      /(-----BEGIN [^-]+-----)[\s\S]*?(-----END [^-]+-----)/g,
      `$1\n${REDACTED_VALUE}\n$2`,
    )
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, REDACTED_VALUE);
}

function isTrackedTool(toolName: string): boolean {
  return TRACKED_TOOL_NAMES.has(toolName.toLowerCase());
}

function setSessionBuffer(sessionID: string, buffer: string[]): void {
  sessionBuffers.delete(sessionID);
  if (sessionBuffers.size >= MAX_TRACKED_SESSIONS) {
    const oldestSessionID = sessionBuffers.keys().next().value;
    if (oldestSessionID) {
      sessionBuffers.delete(oldestSessionID);
    }
  }
  sessionBuffers.set(sessionID, buffer);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && Number.isInteger(value);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return isRecord(error) && error.code === code;
}

function getEffectiveTruncationLengths(
  maxLength: number,
  requestedHeadLength: number,
  requestedTailLength: number,
): { headLength: number; tailLength: number } {
  const safeMaxLength = Math.max(0, maxLength);
  const safeHeadLength = Math.max(0, requestedHeadLength);
  const safeTailLength = Math.max(0, requestedTailLength);
  const effectiveHeadLength = Math.min(safeHeadLength, safeMaxLength);
  const remainingLength = safeMaxLength - effectiveHeadLength;
  const effectiveTailLength = Math.min(safeTailLength, remainingLength);

  return {
    headLength: effectiveHeadLength,
    tailLength: effectiveTailLength,
  };
}

function exceedsCodePointLength(value: string, maxLength: number): boolean {
  let length = 0;
  let index = 0;
  while (index < value.length) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }
    index += codePoint > 0xffff ? 2 : 1;
    length++;
    if (length > maxLength) {
      return true;
    }
  }
  return false;
}

function takeFirstCodePoints(value: string, count: number): string {
  let result = "";
  let taken = 0;
  for (const codePoint of value) {
    if (taken >= count) {
      break;
    }
    result += codePoint;
    taken++;
  }
  return result;
}

function takeLastCodePoints(value: string, count: number): string {
  let result = "";
  let index = value.length;
  let taken = 0;

  while (index > 0 && taken < count) {
    const end = index;
    index--;
    const codeUnit = value.charCodeAt(index);
    if (
      codeUnit >= 0xdc00
      && codeUnit <= 0xdfff
      && index > 0
      && value.charCodeAt(index - 1) >= 0xd800
      && value.charCodeAt(index - 1) <= 0xdbff
    ) {
      index--;
    }
    result = value.slice(index, end) + result;
    taken++;
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function listFileInfos(dir: string): Array<{
  name: string;
  path: string;
  stat: fs.Stats;
}> {
  return fs.readdirSync(dir)
    .map((name) => {
      const filePath = path.join(dir, name);
      try {
        const stat = fs.statSync(filePath);
        return { name, path: filePath, stat };
      } catch (error) {
        console.warn("Failed to stat file during pruning", { path: filePath, error });
        return null;
      }
    })
    .filter((info): info is NonNullable<typeof info> => info !== null && info.stat.isFile());
}

// Helper: deterministically stringify JSON arguments (alphabetical keys)
function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`
  );
  return "{" + parts.join(",") + "}";
}

function mergeSafetyConfig(options: unknown): SafetyConfig {
  const parsedOptions = isRecord(options) ? options : {};
  const truncation = isRecord(parsedOptions.truncation) ? parsedOptions.truncation : {};
  const doomLoop = isRecord(parsedOptions.doomLoop) ? parsedOptions.doomLoop : {};

  const maxLength = isPositiveInteger(truncation.maxLength)
    ? truncation.maxLength
    : DEFAULT_CONFIG.truncation.maxLength;
  const configuredHeadLength = truncation.headLength;
  const configuredTailLength = truncation.tailLength;
  const hasConfiguredHeadLength = isPositiveInteger(configuredHeadLength);
  const hasConfiguredTailLength = isPositiveInteger(configuredTailLength);
  const requestedHeadLength = hasConfiguredHeadLength
    ? configuredHeadLength
    : DEFAULT_CONFIG.truncation.headLength;
  const requestedTailLength = hasConfiguredTailLength
    ? configuredTailLength
    : DEFAULT_CONFIG.truncation.tailLength;
  const hasInvalidConfiguredBudget = hasConfiguredHeadLength
    && hasConfiguredTailLength
    && requestedHeadLength + requestedTailLength > maxLength;
  const effectiveTruncationLengths = getEffectiveTruncationLengths(
    maxLength,
    requestedHeadLength,
    requestedTailLength,
  );

  const bufferSize = isPositiveInteger(doomLoop.bufferSize)
    ? doomLoop.bufferSize
    : DEFAULT_CONFIG.doomLoop.bufferSize;
  const maxRepetitions = isPositiveInteger(doomLoop.maxRepetitions)
    ? doomLoop.maxRepetitions
    : DEFAULT_CONFIG.doomLoop.maxRepetitions;
  const isValidDoomLoopThreshold = maxRepetitions <= bufferSize;

  return {
    truncation: {
      maxLength: !hasInvalidConfiguredBudget
        ? maxLength
        : DEFAULT_CONFIG.truncation.maxLength,
      headLength: !hasInvalidConfiguredBudget
        ? effectiveTruncationLengths.headLength
        : DEFAULT_CONFIG.truncation.headLength,
      tailLength: !hasInvalidConfiguredBudget
        ? effectiveTruncationLengths.tailLength
        : DEFAULT_CONFIG.truncation.tailLength,
      tempDir: typeof truncation.tempDir === "string"
        ? truncation.tempDir
        : DEFAULT_CONFIG.truncation.tempDir,
      retentionHours: isPositiveNumber(truncation.retentionHours)
        ? truncation.retentionHours
        : DEFAULT_CONFIG.truncation.retentionHours,
      maxTempDirSizeMB: isPositiveNumber(truncation.maxTempDirSizeMB)
        ? truncation.maxTempDirSizeMB
        : DEFAULT_CONFIG.truncation.maxTempDirSizeMB,
    },
    doomLoop: {
      enabled: typeof doomLoop.enabled === "boolean"
        ? doomLoop.enabled
        : DEFAULT_CONFIG.doomLoop.enabled,
      bufferSize: isValidDoomLoopThreshold
        ? bufferSize
        : DEFAULT_CONFIG.doomLoop.bufferSize,
      maxRepetitions: isValidDoomLoopThreshold
        ? maxRepetitions
        : DEFAULT_CONFIG.doomLoop.maxRepetitions,
      exemptTools: Array.isArray(doomLoop.exemptTools)
        ? doomLoop.exemptTools.filter((tool): tool is string => typeof tool === "string")
        : DEFAULT_CONFIG.doomLoop.exemptTools,
    },
  };
}

// Helper: perform retention and size cleanup on temp directory
function pruneTempDir(
  dir: string,
  retentionHours: number,
  maxMB: number,
  protectedPath?: string,
): void {
  if (!fs.existsSync(dir)) {
    return;
  }
  try {
    const now = Date.now();
    const retentionMs = retentionHours * 60 * 60 * 1000;
    const maxSize = maxMB * 1024 * 1024;

    const fileInfos = listFileInfos(dir);
    const artifactFiles = fileInfos.filter(
      (info) => info.name.startsWith(ARTIFACT_PREFIX) && info.name.endsWith(ARTIFACT_SUFFIX)
    );

    // 1. Prune by age (older than retentionHours)
    for (const info of artifactFiles) {
      if (info.path === protectedPath) {
        continue;
      }
      const age = now - info.stat.mtimeMs;
      if (age > retentionMs) {
        try {
          fs.unlinkSync(info.path);
        } catch (error) {
          console.warn("Failed to prune old file", { path: info.path, error });
          continue;
        }
      }
    }

    // Refresh file list after age-based pruning
    const remainingFiles = listFileInfos(dir);
    const remainingArtifactFiles = remainingFiles
      .filter((info) =>
        info.name.startsWith(ARTIFACT_PREFIX)
        && info.name.endsWith(ARTIFACT_SUFFIX)
        && info.path !== protectedPath
      )
      .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs); // oldest first

    // 2. Prune by directory size limit
    let totalSize = remainingFiles.reduce((sum, f) => sum + f.stat.size, 0);
    for (const info of remainingArtifactFiles) {
      if (totalSize <= maxSize) {
        break;
      }
      try {
        fs.unlinkSync(info.path);
        totalSize -= info.stat.size;
      } catch (error) {
        console.warn("Failed to prune file due to directory size limits", { path: info.path, error });
        continue;
      }
    }
  } catch (error) {
    console.warn("Directory pruning error", { error });
    return;
  }
}

function createOutputArtifact(
  dir: string,
  sessionID: string | undefined,
  rawOutput: string,
): string | null {
  const timestamp = Date.now();
  const safeSessionID = sanitizeFilenameComponent(sessionID ?? "unknown");

  for (let attempt = 0; attempt < ARTIFACT_CREATION_ATTEMPTS; attempt++) {
    const randomSuffix = crypto.randomBytes(3).toString("hex");
    const fileName = `${ARTIFACT_PREFIX}${safeSessionID}-${timestamp}-${randomSuffix}${ARTIFACT_SUFFIX}`;
    const fullPath = path.join(dir, fileName);

    try {
      fs.writeFileSync(fullPath, rawOutput, { flag: "wx", mode: 0o600 });
      fs.chmodSync(fullPath, 0o600);
      return fullPath;
    } catch (error) {
      if (hasErrorCode(error, "EEXIST")) {
        continue;
      }
      console.warn("Failed to write persistent output file", { error });
      return null;
    }
  }

  console.warn("Failed to allocate a unique persistent output filename");
  return null;
}

export const SafetyPlugin: Plugin = async (
  _input: PluginInput,
  options?: SafetyPluginOptions,
): Promise<Hooks> => {
  const config = mergeSafetyConfig(options);
  const scheduledCleanup = (): void => {
    const { truncation } = config;
    pruneTempDir(
      resolvePath(truncation.tempDir),
      truncation.retentionHours,
      truncation.maxTempDirSizeMB,
    );
  };
  const cleanupIntervalMs = Math.min(
    Math.max(config.truncation.retentionHours * 60 * 60 * 1000, MIN_CLEANUP_INTERVAL_MS),
    MAX_CLEANUP_INTERVAL_MS,
  );
  const cleanupTimer = setInterval(scheduledCleanup, cleanupIntervalMs);
  cleanupTimer.unref();
  scheduledCleanup();

  return {
    dispose: async () => {
      clearInterval(cleanupTimer);
    },
    // Reset buffer on new user message
    "chat.message": async ({ sessionID }) => {
      setSessionBuffer(sessionID, []);
    },

    "tool.execute.after": async (input, output) => {
      const toolName = input.tool;
      const sessionID = input.sessionID;
      const args = input.args ?? {};

      // ─── 1. Output Size Truncation ───
      const { maxLength, headLength, tailLength, tempDir, retentionHours, maxTempDirSizeMB } = config.truncation;
      const rawOutput = output.output ?? "";
      const retainedOutput = redactSensitiveOutput(rawOutput);
      const resolvedTempDir = resolvePath(tempDir);

      if (rawOutput.length > maxLength) {
        if (exceedsCodePointLength(retainedOutput, maxLength)) {
          // Ensure secure directory with 0700 permissions
          let tempDirSecured = true;
          try {
            if (fs.existsSync(resolvedTempDir)) {
              const stat = fs.statSync(resolvedTempDir);
              if (!stat.isDirectory()) {
                throw new Error(`Target path exists but is not a directory: ${resolvedTempDir}`);
              }
              fs.chmodSync(resolvedTempDir, 0o700);
            } else {
              fs.mkdirSync(resolvedTempDir, { recursive: true, mode: 0o700 });
              fs.chmodSync(resolvedTempDir, 0o700);
            }
          } catch (error: unknown) {
            console.error("Failed to create or secure temp directory", { error });
            tempDirSecured = false;
          }

          const fullPath = tempDirSecured
            ? createOutputArtifact(resolvedTempDir, sessionID, retainedOutput)
            : null;
          if (fullPath) {
            // Apply Head-and-Tail Truncation
            const effectiveLengths = getEffectiveTruncationLengths(
              maxLength,
              headLength,
              tailLength,
            );
            const head = takeFirstCodePoints(retainedOutput, effectiveLengths.headLength);
            const tail = effectiveLengths.tailLength > 0
              ? takeLastCodePoints(retainedOutput, effectiveLengths.tailLength)
              : "";
            const redactionNote = retainedOutput !== rawOutput
              ? " Sensitive values were redacted before retention."
              : "";
            const warningMarker = `\n[WARNING: Output truncated at ${maxLength} characters. Showing first ${effectiveLengths.headLength} and last ${effectiveLengths.tailLength} characters. Full output saved to ${fullPath}.${redactionNote}]\n`;

            output.output = head + warningMarker + tail;

            // Cleanup old files in temp directory
            pruneTempDir(resolvedTempDir, retentionHours, maxTempDirSizeMB, fullPath);
          }
        }
      }

      // ─── 2. Doom Loop Detection ───
      if (config.doomLoop.enabled && sessionID) {
        const { bufferSize, maxRepetitions, exemptTools } = config.doomLoop;

        // Check if the current tool is exempt
        const isExempt = exemptTools.some(
          (t) => t.toLowerCase() === toolName.toLowerCase()
        );
        const shouldTrack = isTrackedTool(toolName);

        if (shouldTrack && !isExempt) {
          // Outcome Comparison: Include the output text and/or error information from metadata
          const outcome = rawOutput + "|" + (output.metadata ? canonicalStringify(output.metadata) : "");
          const serializedArgs = canonicalStringify(args);
          const rawHashString = `${toolName}:${serializedArgs}:${outcome}`;
          const callHash = crypto.createHash("sha256").update(rawHashString).digest("hex");

          // Retrieve or initialize the rolling history buffer for this session
          const buffer = sessionBuffers.get(sessionID) ?? [];
          buffer.push(callHash);

          // Keep rolling window at configured size limit
          if (buffer.length > bufferSize) {
            buffer.shift();
          }
          setSessionBuffer(sessionID, buffer);

          // Count repetitions of the current tool call hash in the rolling buffer
          const repetitionCount = buffer.filter((h) => h === callHash).length;

          if (repetitionCount >= maxRepetitions) {
            // Immediately clear buffer upon breaking loop to avoid re-tripping
            setSessionBuffer(sessionID, []);

            // Log diagnostic warning to user
            console.error("Tool call loop detected!", { toolName });

            throw new Error("[DOOM LOOP DETECTED] Aborting execution due to repetitive tool calls.");
          }
        }
      }
    },
  };
};

export default SafetyPlugin;
