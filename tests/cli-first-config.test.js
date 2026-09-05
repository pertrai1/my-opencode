const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const configSource = fs.readFileSync(path.join(root, "opencode.jsonc"), "utf8");
const cliFirst = fs.readFileSync(path.join(root, "docs/agents/cli-first.md"), "utf8");
const catalog = fs.readFileSync(path.join(root, "docs/agents/cli-tools.md"), "utf8");
const agentsDirectory = path.join(root, "agents");
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

function frontMatterPermission(agent) {
  const filename = path.join(agentsDirectory, `${agent}.md`);
  if (!fs.existsSync(filename)) return {};

  const source = fs.readFileSync(filename, "utf8");
  const frontMatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? "";
  const permission = {};
  let inPermission = false;

  for (const line of frontMatter.split("\n")) {
    if (line === "permission:") {
      inPermission = true;
      continue;
    }
    if (inPermission && !line.startsWith(" ")) break;

    const rule = inPermission && line.match(/^ {2}([^:]+): (allow|deny)$/u);
    if (rule) permission[rule[1].replace(/^"|"$/gu, "")] = rule[2];
  }

  return permission;
}

function effectivePermission(agent, tool) {
  const configuredPermission = config.agent[agent]?.permission ?? {};
  const matching = [
    ...stringRules(config.permission),
    ...stringRules(configuredPermission),
    ...stringRules(frontMatterPermission(agent)),
  ]
    .filter(([pattern]) => matchesConfiguredToolPrefix(tool, pattern));
  return matching.at(-1)?.[1];
}

test("CLI-first MCP rules resolve by agent and wildcard namespace", () => {
  const representatives = ["mdn_new_tool", "llm-core_new_tool", "sonarqube_new_tool", "agentmemory_new_tool"];
  const defaultAgents = [
    "general",
    "compaction",
    "lean",
    ...fs.readdirSync(agentsDirectory)
      .filter((filename) => filename.endsWith(".md"))
      .map((filename) => path.basename(filename, ".md")),
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
  for (const agent of ["general", "compaction", ...fs.readdirSync(agentsDirectory).map((filename) => path.basename(filename, ".md"))]) {
    assert.ok(catalog.includes(`| \`${agent}\``), `${agent} must appear in the capability matrix`);
  }
});
