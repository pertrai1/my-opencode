import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const command = read("../commands/code-review.md");
const reviewer = read("../agents/frontend-a11y-reviewer.md");
const section = (doc, heading) => doc.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0] ?? "";
const text = (value) => value.replace(/\s+/g, " ");
const [handoff, ...outcomes] = section(command, "Accessibility guidance handoff").split("\n- ").map(text);

test("the parent retrieves only applicable guidance before a11y delegation", () => {
  assert.match(handoff, /Before launching `frontend-a11y-reviewer`/);
  assert.match(handoff, /load `modern-web-guidance`.*lookup triggers/);
  assert.match(handoff, /generic web-platform query without private code, diffs, paths, or identifiers/);
  assert.match(handoff, /mechanical edit.*unless the user explicitly asks/);
  assert.equal(outcomes.length, 3);
  const [retrieved = "", notNeeded = "", unavailable = ""] = outcomes;
  assert.match(retrieved, /^`retrieved`:.*guide ID.*excerpt.*browser-support target/);
  assert.match(notNeeded, /^`not needed`:.*no lookup trigger/);
  assert.match(unavailable, /^`unavailable`:.*blocked.*Continue the review/);
});

test("the child remains read-only and preserves findings when guidance is absent", () => {
  const [, frontmatter, body] = reviewer.split(/^---$/m);
  for (const action of ["edit", "shell", "subagent"]) {
    assert.match(frontmatter, new RegExp(`action: "${action}"\\s+resource: "\\*"\\s+effect: deny`));
  }
  assert.match(text(body), /Do not run or delegate a guidance lookup/);
  assert.match(text(body), /unavailable or missing.*source-backed findings/);
  assert.match(text(body), /do not claim current browser support/);
  assert.match(text(body), /No accessibility findings.*Still report required human validation and material uncertainty/);
});
