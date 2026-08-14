import type { Plugin, PluginInput, Hooks } from "@opencode-ai/plugin";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as os from "node:os";

// Stateful memory buffer for Doom Loop Detection
// Maps sessionID -> array of tool call hashes (rolling history)
const sessionBuffers = new Map<string, string[]>();

// Default safety configuration
const DEFAULT_CONFIG = {
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
    postAbortAction: "hard_error",
  },
};

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

// Helper: deterministically stringify JSON arguments (alphabetical keys)
function canonicalStringify(obj: any): string {
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

// Helper: clean JSONC comments and trailing commas
function parseJsonc(content: string): any {
  let output = "";
  let state = "default";
  let i = 0;
  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1] ?? "";

    if (state === "default") {
      if (char === '"') {
        state = "string";
        output += char;
      } else if (char === "/" && nextChar === "/") {
        state = "line-comment";
        i++; // skip next /
      } else if (char === "/" && nextChar === "*") {
        state = "block-comment";
        i++; // skip next *
      } else {
        output += char;
      }
    } else if (state === "string") {
      if (char === "\\") {
        state = "escape";
        output += char;
      } else if (char === '"') {
        state = "default";
        output += char;
      } else {
        output += char;
      }
    } else if (state === "escape") {
      state = "string";
      output += char;
    } else if (state === "line-comment") {
      if (char === "\n" || char === "\r") {
        state = "default";
        output += char;
      }
    } else if (state === "block-comment") {
      if (char === "*" && nextChar === "/") {
        state = "default";
        i++; // skip /
      }
    }
    i++;
  }
  const clean = output.replace(/,(\s*[\]}])/g, "$1");
  return JSON.parse(clean);
}

// Helper: load safety config from opencode.jsonc
function loadSafetyConfig(projectDir: string): typeof DEFAULT_CONFIG {
  const configPath = path.join(projectDir, "opencode.jsonc");
  if (fs.existsSync(configPath)) {
    let parsed: any;
    try {
      const raw = fs.readFileSync(configPath, "utf8");
      parsed = parseJsonc(raw);
    } catch (error) {
      console.warn("Failed to load or parse opencode.jsonc, using defaults", { error });
      return DEFAULT_CONFIG;
    }

    if (parsed && parsed.safety) {
      return {
        truncation: {
          ...DEFAULT_CONFIG.truncation,
          ...parsed.safety.truncation,
        },
        doomLoop: {
          ...DEFAULT_CONFIG.doomLoop,
          ...parsed.safety.doomLoop,
        },
      };
    }
  }
  return DEFAULT_CONFIG;
}

// Helper: perform retention and size cleanup on temp directory
function pruneTempDir(dir: string, retentionHours: number, maxMB: number): void {
  if (!fs.existsSync(dir)) {
    return;
  }
  try {
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const retentionMs = retentionHours * 60 * 60 * 1000;
    const maxSize = maxMB * 1024 * 1024;

    const fileInfos = files
      .map((f) => {
        const fp = path.join(dir, f);
        try {
          const stat = fs.statSync(fp);
          return { name: f, path: fp, stat };
        } catch (error) {
          console.warn("Failed to stat file during pruning", { path: fp, error });
          return null;
        }
      })
      .filter((info): info is NonNullable<typeof info> => info !== null && info.stat.isFile() && info.name.startsWith("opencode-full-out-") && info.name.endsWith(".txt"));

    // 1. Prune by age (older than retentionHours)
    for (const info of fileInfos) {
      const age = now - info.stat.mtimeMs;
      if (age > retentionMs) {
        try {
          fs.unlinkSync(info.path);
        } catch (error) {
          console.warn("Failed to prune old file", { path: info.path, error });
          return;
        }
      }
    }

    // Refresh file list after age-based pruning
    const remainingFiles = fs.readdirSync(dir)
      .map((f) => {
        const fp = path.join(dir, f);
        try {
          const stat = fs.statSync(fp);
          return { name: f, path: fp, stat };
        } catch (error) {
          console.warn("Failed to stat remaining file during pruning", { path: fp, error });
          return null;
        }
      })
      .filter((info): info is NonNullable<typeof info> => info !== null && info.stat.isFile() && info.name.startsWith("opencode-full-out-") && info.name.endsWith(".txt"))
      .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs); // oldest first

    // 2. Prune by directory size limit
    let totalSize = remainingFiles.reduce((sum, f) => sum + f.stat.size, 0);
    for (const info of remainingFiles) {
      if (totalSize <= maxSize) {
        break;
      }
      try {
        fs.unlinkSync(info.path);
        totalSize -= info.stat.size;
      } catch (error) {
        console.warn("Failed to prune file due to directory size limits", { path: info.path, error });
        return;
      }
    }
  } catch (error) {
    console.warn("Directory pruning error", { error });
    return;
  }
}

export const SafetyPlugin: Plugin = async ({ directory }: PluginInput): Promise<Hooks> => {
  return {
    // Reset buffer on new user message
    "chat.message": async ({ sessionID }) => {
      if (sessionID) {
        sessionBuffers.set(sessionID, []);
      }
    },

    "tool.execute.after": async (input, output) => {
      const toolName = input.tool;
      const sessionID = input.sessionID;
      const args = input.args ?? {};

      // Load configuration dynamically
      const config = loadSafetyConfig(directory);

      // ─── 1. Output Size Truncation ───
      const { maxLength, headLength, tailLength, tempDir, retentionHours, maxTempDirSizeMB } = config.truncation;
      const rawOutput = output.output ?? "";

      // Performance Optimization: Check UTF-16 length before eagerly building a code points array
      if (rawOutput.length > maxLength) {
        const codePoints = Array.from(rawOutput);

        if (codePoints.length > maxLength) {
          const resolvedTempDir = resolvePath(tempDir);
          
          // Ensure secure directory with 0700 permissions
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
            return;
          }

          // Generate collision-free filename
          const timestamp = Date.now();
          const randomSuffix = crypto.randomBytes(3).toString("hex");
          const fileName = `opencode-full-out-${sessionID ?? "unknown"}-${timestamp}-${randomSuffix}.txt`;
          const fullPath = path.join(resolvedTempDir, fileName);

          // Write complete raw output to secure file with 0600 permissions
          try {
            fs.writeFileSync(fullPath, rawOutput, { mode: 0o600 });
            fs.chmodSync(fullPath, 0o600);
          } catch (error) {
            console.warn("Failed to write persistent output file", { error });
            return;
          }

          // Apply Head-and-Tail Truncation
          const head = codePoints.slice(0, headLength).join("");
          const tail = codePoints.slice(-tailLength).join("");
          const warningMarker = `\n[WARNING: Output truncated at ${maxLength} characters. Showing first ${headLength} and last ${tailLength} characters. Full output saved to ${fullPath}.]\n`;
          
          output.output = head + warningMarker + tail;

          // Cleanup old files in temp directory
          pruneTempDir(resolvedTempDir, retentionHours, maxTempDirSizeMB);
        }
      }

      // ─── 2. Doom Loop Detection ───
      if (config.doomLoop.enabled && sessionID) {
        const { bufferSize, maxRepetitions, exemptTools, postAbortAction } = config.doomLoop;

        // Check if the current tool is exempt
        const isExempt = exemptTools.some(
          (t) => t.toLowerCase() === toolName.toLowerCase()
        );

        if (!isExempt) {
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
          sessionBuffers.set(sessionID, buffer);

          // Count repetitions of the current tool call hash in the rolling buffer
          const repetitionCount = buffer.filter((h) => h === callHash).length;

          if (repetitionCount >= maxRepetitions) {
            // Immediately clear buffer upon breaking loop to avoid re-tripping
            sessionBuffers.set(sessionID, []);

            // Log diagnostic warning to user
            console.error("Tool call loop detected!", { toolName });

            if (postAbortAction === "interactive_pause") {
              throw new Error("[DOOM LOOP DETECTED] Aborting execution due to repetitive tool calls. (Interactive pause triggered)");
            }
            throw new Error("[DOOM LOOP DETECTED] Aborting execution due to repetitive tool calls. (Hard error triggered)");
          }
        }
      }
    },
  };
};

export default SafetyPlugin;
