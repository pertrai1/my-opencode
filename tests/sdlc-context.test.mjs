import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("SDLC extraction preserves permissions and exposes phase docs through workflow", () => {
  const agent = read("agents/sdlc-orchestrator.md");
  const frontmatter = agent.split("---")[1];
  // Baseline at 440326c: this prompt-only refactor must not change permission/model policy.
  assert.equal(createHash("sha256").update(frontmatter).digest("hex"), "bc6aa97b1fdaf1cb55842abf3b2297a9e8d5063bfdf9ab6c1ca8719106fbb29f");
  const { config, error } = ts.parseConfigFileTextToJson("opencode.jsonc", read("opencode.jsonc"));
  assert.equal(error, undefined);
  assert.equal(config.references.workflow.path, "./docs/agents");
  for (const phase of ["discovery", "delivery", "closure"]) {
    assert.ok(agent.includes(`sdlc/${phase}.md`), `core must identify ${phase} reference`);
    assert.match(read(`docs/agents/sdlc/${phase}.md`), /^# SDLC:/);
    assert.equal(config.instructions.some(path => path.includes(`sdlc/${phase}.md`)), false, "phase instructions must not be eagerly loaded");
  }
});

test("always-loaded core retains gating and missing-reference recovery instructions", () => {
  const core = read("agents/sdlc-orchestrator.md");
  for (const rule of [
    /On resume or after compaction/,
    /including `test-author`.*provide applicable evidence rules inline/s,
    /Never broaden their permissions/,
    /If a required reference cannot be read,\s+stop that dependent action/,
    /Before implementation, require concrete scenarios/,
    /Delegate behavioral work through `tdd-orchestrator`/,
    /invalidate prior evidence and approval/,
    /Never archive without current verification, explicit human approval/,
    /verification → implementation \(only after planning re-approval\)/,
  ]) assert.match(core, rule);
});
