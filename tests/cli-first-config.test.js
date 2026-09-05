const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const configSource = fs.readFileSync(path.join(root, "opencode.jsonc"), "utf8");
const cliFirst = fs.readFileSync(path.join(root, "docs/agents/cli-first.md"), "utf8");
const catalog = fs.readFileSync(path.join(root, "docs/agents/cli-tools.md"), "utf8");
const namespaces = ["mdn_*", "llm-core_*", "sonarqube_*", "agentmemory_*"];
const config = JSON.parse(configSource.replace(/,(\s*[}\]])/g, "$1"));

function stringRules(permission = {}) {
  return Object.entries(permission).filter(([, value]) => typeof value === "string");
}

function matchesConfiguredToolPrefix(tool, pattern) {
  return pattern.endsWith("*")
    ? tool.startsWith(pattern.slice(0, -1))
    : tool === pattern;
}

function effectivePermission(agent, tool) {
  const agentPermission = config.agent[agent]?.permission ?? {};
  const matching = [...stringRules(config.permission), ...stringRules(agentPermission)]
    .filter(([pattern]) => matchesConfiguredToolPrefix(tool, pattern));
  return matching.at(-1)?.[1];
}

test("CLI-first MCP rules resolve by agent and wildcard namespace", () => {
  const representatives = ["mdn_new_tool", "llm-core_new_tool", "sonarqube_new_tool", "agentmemory_new_tool"];
  const defaultAgents = [
    "lean",
    "explore",
    "sdlc-orchestrator",
    "tdd-orchestrator",
    "implementer",
    "type-author",
    "test-author",
    "proposal-author",
    "spec-author",
    "design-author",
    "task-planner",
    "spec-syncer",
    "change-verifier",
    "architecture-reviewer",
    "architecture-boundary-reviewer",
    "performance-reviewer",
    "production-readiness-reviewer",
    "test-reviewer",
    "prompt-agent",
  ];

  for (const tool of representatives) {
    assert.ok(namespaces.some((pattern) => matchesConfiguredToolPrefix(tool, pattern)));
    for (const agent of defaultAgents) {
      assert.equal(effectivePermission(agent, tool), "deny", `${agent} must hide ${tool}`);
    }
    for (const agent of ["build", "plan"]) {
      assert.equal(effectivePermission(agent, tool), "allow", `${agent} must retain ${tool}`);
    }
  }
});

test("CLI-first guidance and catalog remain available to every agent", () => {
  assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /@docs\/agents\/cli-first\.md/);
  assert.match(cliFirst, /Restart OpenCode after changing configuration-time files/);
  assert.match(cliFirst, /build.*plan/s);
  assert.match(catalog, /## Agent capability matrix/);
  assert.match(catalog, /## MCP capability decisions/);
});
