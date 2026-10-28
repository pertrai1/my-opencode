import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import yaml from "js-yaml";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("commands/learn.md");
const [, frontmatter, body] = source.split(/^---\s*$/m);
const gate = body.split("Before writing:")[1]?.split("Process:")[0] ?? "";

test("learn retains a valid command shape and nearby concise learning workflow", async () => {
  const schemaRequire = createRequire(import.meta.resolve("@opencode/schema/config/command"));
  const { Schema } = await import(schemaRequire.resolve("effect"));
  const { ConfigCommand } = await import("@opencode/schema/config/command");
  const command = Schema.decodeUnknownSync(ConfigCommand.Info, { onExcessProperty: "error" })({
    ...yaml.load(frontmatter), template: body,
  });
  assert.ok(command.description);
  assert.match(body, /Place learnings as close to the relevant code as possible/);
  assert.match(body, /1-3 lines per insight/);
  assert.match(body, /\$ARGUMENTS\s*$/);
});

test("pre-write guidance excludes sensitive content and unsafe evidence pointers", () => {
  for (const requirement of [
    /secrets, credentials, tokens, cookies, environment values/,
    /personal or private data/,
    /raw prompts, transcripts, model outputs, or tool arguments/,
    /repository-relative.*(?:code|test)/s,
    /private or secret-bearing paths/,
    /generalize.*repository fact.*skip/s,
  ]) assert.match(gate, requirement);
});

test("pre-write guidance separates untrusted content, evidence and existing authority", () => {
  for (const requirement of [
    /untrusted.*(?:files|tool output)/s,
    /do not promote.*instructions.*durable guidance/is,
    /higher-priority instructions/,
    /permissions or approval requirements/,
    /verify.*repository (?:code|tests)/is,
    /hypotheses, failed attempts, or unsupported conclusions/,
    /meaning.*inherited.*AGENTS\.md/s,
    /skip duplicates/,
    /contradict/,
  ]) assert.match(gate, requirement);
});

test("all candidates are checked before edits, with unchanged files and safe skip summaries", () => {
  const process = body.split("Process:")[1] ?? "";
  assert.match(process, /Read existing AGENTS\.md files at relevant levels/);
  assert.match(process, /Apply all pre-write checks.*before editing/s);
  assert.ok(process.indexOf("Apply all pre-write checks") < process.indexOf("Create or update AGENTS.md"));
  assert.match(process, /preserve existing content/);
  assert.match(process, /If no candidates pass, leave files unchanged/);
  assert.match(body, /skipped candidates by reason.*without repeating.*sensitive/s);
  assert.match(gate, /selected repository/);
  assert.match(gate, /does not authorize.*commits.*remote publication/s);
});

test("synthetic examples retain reviewable evidence and expectations, not model scores", () => {
  const cases = yaml.load(read("evals/learn/examples.yaml")).map(({ vars }) => vars);
  assert.equal(new Set(cases.map(({ id }) => id)).size, cases.length);
  assert.deepEqual(new Set(cases.map(({ category }) => category)), new Set([
    "verified", "sensitive", "generalized", "transcript", "untrusted", "authority",
    "unsupported", "duplicate", "contradiction", "scope",
  ]));
  for (const entry of cases) {
    assert.ok(entry.session.trim(), entry.id);
    assert.ok(entry.repository_evidence.trim(), entry.id);
    assert.ok(entry.existing_guidance.trim(), entry.id);
    assert.ok(entry.semantic_review.trim(), entry.id);
    assert.ok(["retain", "skip"].includes(entry.expected.decision), entry.id);
    assert.ok(entry.expected.reason.trim(), entry.id);
    if (entry.expected.decision === "retain") {
      assert.match(entry.expected.target, /(?:^|\/)AGENTS\.md$/);
      assert.ok(entry.expected.learning.trim(), entry.id);
      assert.ok(entry.expected.learning.split("\n").length <= 3, entry.id);
    } else {
      assert.equal(entry.expected.target, null, entry.id);
      assert.equal(entry.expected.learning, null, entry.id);
    }
  }
});
