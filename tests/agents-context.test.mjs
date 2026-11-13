import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import yaml from "js-yaml";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const agents = read("AGENTS.md");
const skill = read("skills/harness-maintenance/SKILL.md");
const protocol = read("docs/agents/verification-evidence.md").replace(/\s+/g, " ");
const sections = text => text.split("\n").filter(line => /^##+ /.test(line)).map(line => line.replace(/^#+ /, ""));

// AGENTS.md loads in every project; rules for changing this repository load on demand.
const moved = ["Policy ownership and consistency", "Plugin and shared runtime changes", "Generated and vendored content", "Configuration changes"];

test("repository-only rules live in the harness-maintenance skill, not the global AGENTS.md", () => {
  const metadata = yaml.load(skill.match(/^---\n([\s\S]*?)\n---/)[1]);
  assert.equal(metadata.name, "harness-maintenance");
  assert.ok(metadata.description.length <= 1024);
  for (const section of moved) {
    assert.ok(sections(skill).includes(section), `skill must own ${section}`);
    assert.equal(sections(agents).includes(section), false, `AGENTS.md must not repeat ${section}`);
  }
  assert.match(agents, /load and follow the `harness-maintenance` skill \(`skills\/harness-maintenance\/SKILL\.md`\)/);
});

test("rules every project needs stay in AGENTS.md", () => {
  for (const section of ["Frontend A11Y", "Issue tracker", "Triage labels", "Domain docs", "CodeScene", "Code graph", "Task state", "Architecture reviews", "Verification evidence"]) {
    assert.ok(sections(agents).includes(section), `AGENTS.md must keep ${section}`);
  }
});

test("evidence rules have one source: the globally loaded protocol", () => {
  assert.match(agents, /globally loaded `~\/\.config\/opencode\/docs\/agents\/verification-evidence\.md` protocol/);
  assert.doesNotMatch(agents, /Never describe verification as fully passing/);
  for (const rule of [
    "use the observed error to distinguish a confirmed application failure from an environment restriction or an unresolved cause",
    "do not infer that an environment-blocked check would pass elsewhere",
    "Never call verification fully passing while a required check failed, was skipped, or was blocked",
  ]) assert.ok(protocol.includes(rule), `protocol must keep: ${rule}`);
});
