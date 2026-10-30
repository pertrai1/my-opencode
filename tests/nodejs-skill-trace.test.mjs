import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import test from "node:test";
import grade from "../evals/nodejs-skill/trace-grade.mjs";

const providerUrl = new URL("../evals/nodejs-skill/trace-provider.mjs", import.meta.url).href;
const skill = { name: "skill", status: "completed", arguments: { id: "nodejs" } };
const read = { name: "read", status: "completed", arguments: { filePath: "/config/skills/nodejs/references/testing.md" } };

test("trace grader requires completed skill and relevant reference reads", () => {
  const context = { vars: { activate: true, references: ["testing"] } };
  assert.equal(grade(JSON.stringify({ toolCalls: [skill, read] }), context), true);
  for (const toolCalls of [[skill], [read], [{ ...skill, status: "error" }, read], [skill, { ...read, status: "error" }]]) {
    assert.equal(grade(JSON.stringify({ toolCalls }), context), false);
  }
  assert.equal(grade("malformed", context), false);
  assert.equal(grade(JSON.stringify({ toolCalls: [skill] }), { vars: { activate: false } }), false);
  assert.equal(grade(JSON.stringify({ toolCalls: [] }), { vars: { activate: false } }), true);
});

for (const fixture of ["node", "browser"]) {
  test(`Node trace provider uses ${fixture} root and preserves read inputs`, t => {
    const root = mkdtempSync(join(tmpdir(), "node-trace-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bin = join(root, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "opencode"), `#!/usr/bin/env node
const [, method, path, , data] = process.argv.slice(2);
const body = data ? JSON.parse(data) : {};
if (path === "/api/session" && body.root !== ${JSON.stringify(root)}) process.exit(1);
let result = {};
if (path === "/api/session") result = { data: { id: "trace-session" } };
if (method === "get") result = { data: [
  { type: "user", text: "review" },
  { type: "assistant", content: [
    { type: "tool", name: "read", state: { status: "completed", input: { filePath: "/config/skills/nodejs/references/testing.md" } } }
  ] },
  { type: "idle", outcome: "succeeded" }
] };
console.log(JSON.stringify(result));
`, { mode: 0o755 });
    function call(configured) {
      const result = spawnSync(process.execPath, ["--input-type=module", "--eval", `
        import Provider from ${JSON.stringify(providerUrl)};
        console.log(JSON.stringify(await new Provider().callApi("review", { vars: { fixture: ${JSON.stringify(fixture)} } })));
      `], { encoding: "utf8", timeout: 10_000, env: {
        PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
        [`NODEJS_SKILL_${fixture.toUpperCase()}_ROOT`]: configured,
      } });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    }
    const missing = call("");
    assert.match(missing.error, /Set NODEJS_SKILL_/);
    assert.equal(missing.metadata.sessionId, undefined);
    const result = call(root);
    assert.equal(result.error, undefined);
    assert.equal(result.metadata.sessionId, "trace-session");
    assert.deepEqual(JSON.parse(result.output).toolCalls, [read]);
  });
}
