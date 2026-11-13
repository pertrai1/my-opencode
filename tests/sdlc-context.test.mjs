import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import yaml from "js-yaml";
import { PHASE_SKILLS } from "../evals/ooda/tools.mjs";
import { effect } from "./helpers/permission-rules.mjs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const frontMatter = text => yaml.load(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
const core = read("agents/sdlc-orchestrator.md");
const skills = Object.fromEntries(PHASE_SKILLS.map(name => [name, read(`skills/${name}/SKILL.md`)]));
const { config, error } = ts.parseConfigFileTextToJson("opencode.jsonc", read("opencode.jsonc"));
assert.equal(error, undefined);

const headings = text => text.split("\n").filter(line => /^##+ /.test(line));
const everyPhaseRules = () => {
  const section = core.split("### Rules that apply in every phase")[1].split("\n## ")[0];
  return section.split("\n").filter(line => line.startsWith("- ")).map(line => line.slice(2));
};

test("each SDLC phase contract is an orchestrator skill loaded on demand", () => {
  const rules = [...config.permissions, ...(frontMatter(core).permissions ?? [])];
  for (const name of PHASE_SKILLS) {
    const metadata = frontMatter(skills[name]);
    assert.equal(metadata.name, name);
    assert.match(metadata.description, /sdlc-orchestrator agent/);
    assert.match(skills[name], /\n# SDLC: /);
    assert.ok(core.includes(`\`${name}\``), `core must name ${name}`);
    assert.equal(effect(rules, "skill", name), "allow", `${name} must load without approval`);
    assert.equal(config.instructions.some(path => path.includes(name)), false, `${name} must not be eagerly loaded`);
  }
  assert.match(core, /On resume or after compaction, read the active change's `progress.md` and\s+`intent.md`/);
  assert.match(core, /If a phase skill cannot be loaded, stop the work that depends on it/);
});

test("phase skills own their sections and the core keeps cross-phase rules", () => {
  const coreHeadings = headings(core);
  for (const name of PHASE_SKILLS) {
    for (const heading of headings(skills[name]).filter(line => line.startsWith("## "))) {
      assert.equal(coreHeadings.includes(heading), false, `${heading} belongs only to ${name}`);
    }
  }
  for (const heading of ["## Store selection", "## Task completion authority"]) {
    assert.ok(coreHeadings.includes(heading), `core must keep ${heading}`);
    assert.equal(PHASE_SKILLS.some(name => skills[name].includes(heading)), false, `${heading} must not move into a phase skill`);
  }
  assert.ok(core.indexOf("as defined below") < core.indexOf("## Task completion authority"), "coordination files must point at a section below them");
});

test("every-phase rules in the core match their owning skill word for word", () => {
  const rules = everyPhaseRules();
  assert.ok(rules.length >= 5);
  for (const rule of rules) {
    const owners = PHASE_SKILLS.filter(name => skills[name].includes(rule));
    assert.equal(owners.length, 1, `rule must appear verbatim in exactly one phase skill: ${rule}`);
  }
});

test("handoff examples stay inside the delivery contract", () => {
  assert.match(skills["sdlc-delivery"], /It must provide only the handoff constraints above/);
  assert.match(core, /In\s+`tdd-orchestrator` handoffs, cite only spec scenarios, existing tests, and\s+public API examples, within the delivery handoff contract/);
  assert.match(core, /Preserve the test author's public-evidence-only boundary through TDD/);
});
