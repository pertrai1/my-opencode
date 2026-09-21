import { Plugin } from "@opencode/plugin";
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
    await ctx.mcp.transform((editor) => editor.update("sonarqube", (config) => {
      const local = config as Extract<typeof config, { type: "local" }>;
      local.disabled = false;
      // Transforms are synchronous; resolve the Docker alias when the MCP config
      // is next refreshed rather than performing asynchronous work here.
      local.command = removeDockerAddHost(local.command);
      local.environment = environment;
    }));
  },
});
