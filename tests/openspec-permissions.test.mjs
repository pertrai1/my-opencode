import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import yaml from "js-yaml";
import { effect } from "./helpers/permission-rules.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { config, error } = ts.parseConfigFileTextToJson("opencode.jsonc", read("opencode.jsonc"));
assert.equal(error, undefined);
const rules = name => [
  ...config.permissions,
  ...yaml.load(read(`agents/${name}.md`).match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]).permissions,
];
const paths = path => [path, `packages/app/${path}`, `/workspace/project/${path}`];

// V2 uses simple whole-value wildcards, not filesystem globstar matching.
// These are policy regression checks, not live OpenCode tool execution.
test("SDLC coordination edits allow location-relative and qualified paths", () => {
  for (const file of ["progress.md", "intent.md", "verification.md", "tasks.md"]) {
    for (const path of paths(`openspec/changes/example/${file}`)) {
      assert.equal(effect(rules("sdlc-orchestrator"), "edit", path), "allow", path);
    }
  }
  for (const path of paths(".agents/work/example/progress.md")) {
    assert.equal(effect(rules("sdlc-orchestrator"), "edit", path), "allow", path);
  }
});

test("spec authors and syncers allow their own location-relative artifacts", () => {
  for (const [agent, artifact] of [
    ["spec-author", "openspec/changes/example/specs/api/spec.md"],
    ["spec-syncer", "openspec/specs/api/spec.md"],
  ]) {
    for (const path of paths(artifact)) {
      assert.equal(effect(rules(agent), "edit", path), "allow", `${agent}: ${path}`);
    }
  }
});

test("relative-path exceptions preserve artifact ownership and unrelated edit denials", () => {
  const forbidden = {
    "sdlc-orchestrator": ["openspec/changes/example/proposal.md", "openspec/changes/example/design.md", "openspec/changes/example/specs/api/spec.md"],
    "spec-author": ["openspec/specs/api/spec.md", "openspec/changes/example/tasks.md", "openspec/changes/example/specs/api/schema.json"],
    "spec-syncer": ["openspec/changes/example/specs/api/spec.md", "openspec/specs/api/schema.json"],
  };
  for (const [agent, artifacts] of Object.entries(forbidden)) {
    for (const path of [...artifacts, "src/index.ts", "tests/example.test.ts", "opencode.jsonc", "progress.md"].flatMap(paths)) {
      assert.equal(effect(rules(agent), "edit", path), "deny", `${agent}: ${path}`);
    }
  }
});

test("OpenSpec artifact access does not bypass external-directory approval", () => {
  for (const agent of ["sdlc-orchestrator", "spec-author", "spec-syncer"]) {
    assert.equal(effect(rules(agent), "external_directory", "/standalone/store/*"), "ask", agent);
  }
});
