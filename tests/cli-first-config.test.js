const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const config = fs.readFileSync(path.join(root, "opencode.jsonc"), "utf8");
const cliFirst = fs.readFileSync(path.join(root, "docs/agents/cli-first.md"), "utf8");
const catalog = fs.readFileSync(path.join(root, "docs/agents/cli-tools.md"), "utf8");
const namespaces = ["mdn_*", "llm-core_*", "sonarqube_*", "agentmemory_*"];

test("CLI-first MCP defaults deny namespaces and richer agents explicitly restore them", () => {
  for (const namespace of namespaces) {
    assert.ok(config.includes(`"${namespace}": "deny"`));
  }

  for (const agent of ["build", "plan"]) {
    const start = config.indexOf(`"${agent}": {`);
    const end = config.indexOf("\n    },", start);
    const section = config.slice(start, end);
    for (const namespace of namespaces) {
      assert.ok(section.includes(`"${namespace}": "allow"`));
    }
  }

  for (const tool of ["mdn_new_tool", "llm-core_new_tool", "sonarqube_new_tool", "agentmemory_new_tool"]) {
    assert.ok(namespaces.some((pattern) => path.matchesGlob(tool, pattern)));
  }
});

test("CLI-first guidance and catalog remain available to every agent", () => {
  assert.match(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), /@docs\/agents\/cli-first\.md/);
  assert.match(cliFirst, /Restart OpenCode after changing configuration-time files/);
  assert.match(cliFirst, /build.*plan/s);
  assert.match(catalog, /## Agent capability matrix/);
  assert.match(catalog, /## MCP capability decisions/);
});
