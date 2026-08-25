import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function parseProperties(source: string): Record<string, string> {
  const properties: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;

    const separatorIndex = line.search(/[:=]/u);
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) properties[key] = value;
  }

  return properties;
}

function clearSonarqubeEnvironment(environment: Record<string, string>): void {
  delete environment.SONARQUBE_PROJECT_KEY;
  delete environment.SONARQUBE_URL;
}

function removeDockerAddHost(command: string[]): string[] {
  const nextCommand: string[] = [];

  for (let index = 0; index < command.length; index += 1) {
    if (command[index] === "--add-host") {
      index += 1;
      continue;
    }

    nextCommand.push(command[index]);
  }

  return nextCommand;
}

async function addResolvedHostAlias(
  command: string[],
  sonarUrl: string,
): Promise<string[]> {
  try {
    const hostname = new URL(sonarUrl).hostname;
    if (!hostname) return command;

    const { address } = await lookup(hostname);
    const nextCommand = removeDockerAddHost(command);
    const imageIndex = nextCommand.findIndex(
      (part) => !part.startsWith("-") && part.includes("/"),
    );
    if (imageIndex === -1) return command;

    nextCommand.splice(imageIndex, 0, "--add-host", `${hostname}:${address}`);
    return nextCommand;
  } catch {
    return removeDockerAddHost(command);
  }
}

export async function SonarqubeMcp({ worktree }: PluginInput): Promise<Hooks> {
  return {
    config: async (config) => {
      const server = config.mcp?.sonarqube;
      if (!server) return;
      if (server.type !== "local") return;

      const environment = {
        ...(server.environment && typeof server.environment === "object"
          ? server.environment
          : {}),
      } as Record<string, string>;

      const propertiesPath = join(
        worktree ?? process.cwd(),
        "sonar-project.properties",
      );
      if (!existsSync(propertiesPath)) {
        server.enabled = false;
        clearSonarqubeEnvironment(environment);
        server.environment = environment;
        return;
      }

      const properties = parseProperties(readFileSync(propertiesPath, "utf8"));
      const sonarUrl = properties["sonar.host.url"];
      if (!sonarUrl) {
        server.enabled = false;
        clearSonarqubeEnvironment(environment);
        server.environment = environment;
        console.warn(
          "[sonarqube-mcp] MCP disabled because sonar.host.url is missing",
          {
            propertiesPath,
          },
        );
        return;
      }

      environment.SONARQUBE_URL = sonarUrl;
      server.command = await addResolvedHostAlias(server.command, sonarUrl);
      if (properties["sonar.projectKey"]) {
        environment.SONARQUBE_PROJECT_KEY = properties["sonar.projectKey"];
      } else {
        delete environment.SONARQUBE_PROJECT_KEY;
      }

      server.enabled = true;
      server.environment = environment;
    },
  };
}
