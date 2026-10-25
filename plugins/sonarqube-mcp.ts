import { Plugin } from "@opencode/plugin";
import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
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

// The container cannot resolve names known only to the host, such as /etc/hosts or VPN entries.
async function resolveHostAlias(sonarUrl: string): Promise<string | undefined> {
  try {
    const { hostname } = new URL(sonarUrl);
    if (!hostname || isIP(hostname)) return undefined;

    const { address } = await lookup(hostname);
    return `${hostname}:${address}`;
  } catch {
    return undefined;
  }
}

function withDockerAddHost(command: string[], hostAlias: string | undefined): string[] {
  const nextCommand = removeDockerAddHost(command);
  if (!hostAlias) return nextCommand;

  const imageIndex = nextCommand.findIndex((part) => !part.startsWith("-") && part.includes("/"));
  if (imageIndex === -1) return nextCommand;

  nextCommand.splice(imageIndex, 0, "--add-host", hostAlias);
  return nextCommand;
}

export default Plugin.define({
  id: "sonarqube-mcp",
  async setup(ctx) {
    const propertiesPath = join(ctx.location.directory, "sonar-project.properties");
    if (!existsSync(propertiesPath)) {
      await ctx.mcp.transform((editor) => editor.update("sonarqube", (config) => {
        const local = config as Extract<typeof config, { type: "local" }>;
        const environment = local.environment ?? {};
        local.disabled = true;
        clearSonarqubeEnvironment(environment);
        local.environment = environment;
      }));
      return;
    }
    const properties = parseProperties(readFileSync(propertiesPath, "utf8"));
    const sonarUrl = properties["sonar.host.url"];
    if (!sonarUrl) {
      console.warn("[sonarqube-mcp] MCP disabled because sonar.host.url is missing", { propertiesPath });
      await ctx.mcp.transform((editor) => editor.update("sonarqube", (config) => {
        const local = config as Extract<typeof config, { type: "local" }>;
        const environment = local.environment ?? {};
        local.disabled = true;
        clearSonarqubeEnvironment(environment);
        local.environment = environment;
      }));
      return;
    }
    const environment: Record<string, string> = {};
    environment.SONARQUBE_URL = sonarUrl;
    if (properties["sonar.projectKey"]) environment.SONARQUBE_PROJECT_KEY = properties["sonar.projectKey"];
    else delete environment.SONARQUBE_PROJECT_KEY;
    // Transforms are synchronous, so resolve the alias before registering one.
    const hostAlias = await resolveHostAlias(sonarUrl);
    await ctx.mcp.transform((editor) => editor.update("sonarqube", (config) => {
      const local = config as Extract<typeof config, { type: "local" }>;
      local.disabled = false;
      local.command = withDockerAddHost(local.command, hostAlias);
      local.environment = environment;
    }));
  },
});
