import test from "node:test";
import assert from "node:assert/strict";
import { cases } from "./cases.mjs";
import { grade } from "./grade.mjs";

const missing = cases.find((item) => item.id === "missing-target");
const explicit = cases.find((item) => item.id === "explicit-target");

const ask = {
  name: "ask_user",
  args: { question: "Which model should become the default?" },
};

const edit = {
  name: "edit_file",
  args: {
    path: "settings.json",
    content: JSON.stringify({ defaultModel: "example/model-b" }),
  },
};

const finish = { name: "finish", args: {} };

test("accepts asking when the target is missing", () => {
  assert.equal(grade(missing, [ask]).pass, true);
});

test("rejects editing before asking", () => {
  assert.equal(grade(missing, [edit, ask]).pass, false);
});

test("accepts the requested edit without clarification", () => {
  assert.equal(grade(explicit, [edit, finish]).pass, true);
});

test("rejects unnecessary clarification", () => {
  assert.equal(grade(explicit, [ask]).pass, false);
});

test("rejects finishing without making the edit", () => {
  assert.equal(grade(explicit, [finish]).pass, false);
});

test("rejects an empty episode", () => {
  assert.equal(grade(missing, []).pass, false);
});
