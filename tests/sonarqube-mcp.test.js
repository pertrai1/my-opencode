const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

require("./helpers/register-ts.js");

const { SonarqubeMcp } = require("../plugins/sonarqube-mcp.ts");

function serverConfig() {
  return {
    mcp: {
      sonarqube: {
        type: "local",
        enabled: true,
        command: ["docker", "run", "-i", "sonarsource/sonarqube-mcp"],
        environment: {
          SONARQUBE_TOKEN: "test-token",
          SONARQUBE_URL: "https://stale.example.test",
          SONARQUBE_PROJECT_KEY: "stale-project",
        },
      },
    },
  };
}

test("SonarQube MCP activates only for a configured target project", async (t) => {
  const withoutProject = fs.mkdtempSync(path.join(os.tmpdir(), "sonarqube-mcp-empty-"));
  const withoutUrl = fs.mkdtempSync(path.join(os.tmpdir(), "sonarqube-mcp-url-missing-"));
  const withoutProjectKey = fs.mkdtempSync(path.join(os.tmpdir(), "sonarqube-mcp-key-missing-"));
  const withProject = fs.mkdtempSync(path.join(os.tmpdir(), "sonarqube-mcp-configured-"));
  t.after(() => {
    fs.rmSync(withoutProject, { recursive: true, force: true });
    fs.rmSync(withoutUrl, { recursive: true, force: true });
    fs.rmSync(withoutProjectKey, { recursive: true, force: true });
    fs.rmSync(withProject, { recursive: true, force: true });
  });

  const disabled = serverConfig();
  const disabledHooks = await SonarqubeMcp({ worktree: withoutProject });
  await disabledHooks.config(disabled);
  assert.equal(disabled.mcp.sonarqube.enabled, false);
  assert.equal(disabled.mcp.sonarqube.environment.SONARQUBE_URL, undefined);
  assert.equal(disabled.mcp.sonarqube.environment.SONARQUBE_PROJECT_KEY, undefined);

  fs.writeFileSync(path.join(withoutUrl, "sonar-project.properties"), "sonar.projectKey=example-project\n");
  const urlMissing = serverConfig();
  const urlMissingHooks = await SonarqubeMcp({ worktree: withoutUrl });
  await urlMissingHooks.config(urlMissing);
  assert.equal(urlMissing.mcp.sonarqube.enabled, false);
  assert.equal(urlMissing.mcp.sonarqube.environment.SONARQUBE_URL, undefined);
  assert.equal(urlMissing.mcp.sonarqube.environment.SONARQUBE_PROJECT_KEY, undefined);

  fs.writeFileSync(path.join(withoutProjectKey, "sonar-project.properties"), "sonar.host.url=http://127.0.0.1:9000\n");
  const projectKeyMissing = serverConfig();
  const projectKeyMissingHooks = await SonarqubeMcp({ worktree: withoutProjectKey });
  await projectKeyMissingHooks.config(projectKeyMissing);
  assert.equal(projectKeyMissing.mcp.sonarqube.enabled, false);
  assert.equal(projectKeyMissing.mcp.sonarqube.environment.SONARQUBE_URL, undefined);
  assert.equal(projectKeyMissing.mcp.sonarqube.environment.SONARQUBE_PROJECT_KEY, undefined);

  fs.writeFileSync(
    path.join(withProject, "sonar-project.properties"),
    "sonar.host.url=http://127.0.0.1:9000\nsonar.projectKey=example-project\n",
  );
  const enabled = serverConfig();
  const enabledHooks = await SonarqubeMcp({ worktree: withProject });
  await enabledHooks.config(enabled);
  assert.equal(enabled.mcp.sonarqube.enabled, true);
  assert.equal(enabled.mcp.sonarqube.environment.SONARQUBE_URL, "http://127.0.0.1:9000");
  assert.equal(enabled.mcp.sonarqube.environment.SONARQUBE_PROJECT_KEY, "example-project");
});
