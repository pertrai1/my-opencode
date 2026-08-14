import type { Hooks, PluginInput } from "@opencode-ai/plugin";

const sessionAgents = new Map<string, string>();

function isDestructive(cmd: string): boolean {
  const normalized = cmd.toLowerCase().trim();

  // Blocked destructive/mutation commands
  const blockedRoots = [
    "cp", "chmod", "ln", "touch", "truncate", "tee", "rm", "mv", "mkdir"
  ];
  for (const root of blockedRoots) {
    const regex = new RegExp(`(^|\\s)${root}(\\s|$)`, "i");
    if (regex.test(normalized)) {
      return true;
    }
  }

  // Compound destructive commands
  if (/(^|\s)npm\s+install(\s|$)/i.test(normalized)) return true;
  if (/(^|\s)git\s+checkout(\s|$)/i.test(normalized)) return true;
  if (/(^|\s)git\s+restore(\s|$)/i.test(normalized)) return true;
  if (/(^|\s)git\s+merge(\s|$)/i.test(normalized)) return true;
  if (/(^|\s)git\s+reset(\s|$)/i.test(normalized)) return true;

  // For git stash: allow git stash list, deny other git stash commands
  if (/(^|\s)git\s+stash(\s|$)/i.test(normalized)) {
    if (!/(^|\s)git\s+stash\s+list(\s|$)/i.test(normalized)) {
      return true;
    }
  }

  // Restrict sed and awk from any in-place write flags (e.g. sed -i is blocked)
  if (/(^|\s)sed(\s|$)/i.test(normalized)) {
    if (/\s-i(\s|$)/i.test(normalized) || /\s--in-place(\s|$)/i.test(normalized)) {
      return true;
    }
  }

  return false;
}

function hasWriteRedirection(command: string): boolean {
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuotes) {
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (char === '"' && !inSingleQuotes) {
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (!inSingleQuotes && !inDoubleQuotes) {
      if (char === ">") {
        let nextIdx = i + 1;
        if (command[nextIdx] === ">") {
          nextIdx++;
        }
        while (nextIdx < command.length && /\s/.test(command[nextIdx])) {
          nextIdx++;
        }
        if (command[nextIdx] === "&" && (command[nextIdx + 1] === "1" || command[nextIdx + 1] === "2")) {
          i = nextIdx + 1;
          continue;
        }
        return true;
      }
    }
  }

  return false;
}

function splitChainedCommands(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingleQuotes = false;
  let inDoubleQuotes = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuotes) {
      current += char;
      inSingleQuotes = !inSingleQuotes;
      continue;
    }

    if (char === '"' && !inSingleQuotes) {
      current += char;
      inDoubleQuotes = !inDoubleQuotes;
      continue;
    }

    if (!inSingleQuotes && !inDoubleQuotes) {
      if (char === ";") {
        parts.push(current);
        current = "";
        continue;
      }
      if (char === "&" && command[i + 1] === "&") {
        parts.push(current);
        current = "";
        i++;
        continue;
      }
      if (char === "|" && command[i + 1] === "|") {
        parts.push(current);
        current = "";
        i++;
        continue;
      }
      if (char === "|") {
        parts.push(current);
        current = "";
        continue;
      }
      if (char === "&") {
        parts.push(current);
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts.map(p => p.trim()).filter(Boolean);
}

export const SafetyPlugin = async (input: PluginInput): Promise<Hooks> => {
  // Use input to avoid unused variable error
  if (input.directory) {
    // directory exists
  }
  return {
    "chat.message": async (msgInput) => {
      if (msgInput.sessionID && msgInput.agent) {
        sessionAgents.set(msgInput.sessionID, msgInput.agent);
      }
    },

    event: async ({ event }) => {
      const type = event?.type;
      const properties = (event?.properties ?? {}) as Record<string, unknown>;
      if (type === "session.created" || type === "session.updated") {
        const info = properties.info as Record<string, unknown> | undefined;
        const sid = (info?.id as string) || (properties.sessionID as string);
        const agent = (info?.agent as string) || (properties.agent as string);
        if (sid && agent) {
          sessionAgents.set(sid, agent);
        }
      }
    },

    "permission.ask": async (input, output) => {
      const agent = sessionAgents.get(input.sessionID);
      if (agent === "explore") {
        const type = String(input.type ?? "").toLowerCase();
        if (type === "edit" || type === "task") {
          output.status = "deny";
          return;
        }
      }
    },

    "tool.execute.before": async (input, output) => {
      const agent = sessionAgents.get(input.sessionID);
      if (agent === "explore") {
        const tool = String(input.tool ?? "").toLowerCase();

        // 1. Block edit and task tools
        if (tool === "edit" || tool === "task") {
          throw new Error(`Permission denied: Tool '${input.tool}' is blocked for the explore agent.`);
        }

        // 2. Block agentmemory MCP state-writing/mutation tools or MCP entirely
        if (tool.startsWith("agentmemory")) {
          throw new Error(`Permission denied: MCP 'agentmemory' is disabled for the explore agent.`);
        }

        // 3. Preserve Secret Protection
        if (tool === "read") {
          const filePath = String(output.args?.path ?? "").toLowerCase();
          if (filePath.endsWith(".env") || (filePath.includes(".env.") && !filePath.endsWith(".env.example"))) {
            throw new Error(`Permission denied: Reading sensitive env files is blocked.`);
          }
        }

        // 4. Validate bash command execution
        if (tool === "bash" || tool === "shell") {
          const command = String(output.args?.command ?? "");

          // Check write redirections
          if (hasWriteRedirection(command)) {
            throw new Error(`Permission denied: Write redirection operator is blocked.`);
          }

          // Split chained commands and check each
          const subcommands = splitChainedCommands(command);
          for (const cmd of subcommands) {
            if (isDestructive(cmd)) {
              throw new Error(`Permission denied: Command '${cmd}' is blocked for the explore agent.`);
            }
          }
        }
      }
    },
  };
};

export default SafetyPlugin;
