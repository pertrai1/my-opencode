import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import config from "../evals/nodejs-skill/trace.mjs";

const repository = fileURLToPath(new URL("..", import.meta.url));

for (const forbidden of [false, true]) {
  test(`actual Promptfoo trace config keeps both reference arrays intact (forbidden read: ${forbidden})`, t => {
    const root = mkdtempSync(join(tmpdir(), "node-promptfoo-trace-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const bin = join(root, "bin");
    const node = join(root, "node");
    const browser = join(root, "browser");
    for (const directory of [bin, node, browser]) mkdirSync(directory);
    const log = join(root, "calls.jsonl");
    writeFileSync(log, "");
    const scenarios = Object.fromEntries(config.tests.map(row => [row.vars.fixture, row.vars]));
    writeFileSync(join(bin, "opencode"), `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
const [, method, path, , data] = process.argv.slice(2);
const body = data ? JSON.parse(data) : {};
const scenarios = ${JSON.stringify(scenarios)};
let result = {};
if (path === "/api/session") {
  const id = body.root === ${JSON.stringify(node)} ? "node" : "browser";
  appendFileSync(${JSON.stringify(log)}, JSON.stringify({ id }) + "\\n");
  result = { data: { id } };
}
if (method === "get") {
  const id = path.includes("/node/") ? "node" : "browser";
  const calls = id === "node" ? [
    { name: "skill", input: { id: "nodejs" } },
    ...["async-and-errors", "runtime-reliability", "testing"${forbidden ? ', "services-and-production"' : ""}].map(ref => ({ name: "read", input: { filePath: "/config/skills/nodejs/references/" + ref + ".md" } }))
  ] : [];
  result = { data: [
    { type: "user", text: scenarios[id].task },
    { type: "assistant", content: calls.map(call => ({ type: "tool", name: call.name, state: { input: call.input, status: "completed" } })) },
    { type: "idle", outcome: "succeeded" }
  ] };
}
console.log(JSON.stringify(result));
`, { mode: 0o755 });
    const output = join(root, "results.json");
    const result = spawnSync(process.execPath, [
      "--require", "./evals/failure-reporting/offline.js",
      "./node_modules/promptfoo/dist/src/entrypoint.js", "eval",
      "-c", "evals/nodejs-skill/trace.mjs", "--no-cache", "--no-write",
      "--no-share", "--no-progress-bar", "-o", output,
    ], { cwd: repository, encoding: "utf8", timeout: 30_000, env: {
      PATH: [bin, dirname(process.execPath), process.env.PATH].join(delimiter),
      NODEJS_SKILL_NODE_ROOT: node,
      NODEJS_SKILL_BROWSER_ROOT: browser,
      PROMPTFOO_DISABLE_TELEMETRY: "1", PROMPTFOO_DISABLE_UPDATE: "1",
      PROMPTFOO_CONFIG_DIR: join(root, "promptfoo"),
    } });
    assert.ifError(result.error);
    assert.equal(result.status, forbidden ? 100 : 0, result.stdout + result.stderr);
    const report = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(report.results.results.length, 2, "one session per fixture, no array expansion");
    assert.deepEqual(readFileSync(log, "utf8").trim().split("\n").map(JSON.parse), [{ id: "node" }, { id: "browser" }]);
    assert.equal(report.results.stats.successes, forbidden ? 1 : 2);
    assert.equal(report.results.stats.failures, forbidden ? 1 : 0);
  });
}
