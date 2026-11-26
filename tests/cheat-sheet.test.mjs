import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");
const list = dir => readdirSync(resolve(root, dir), { withFileTypes: true });

const cheatSheet = read("docs/cheat-sheet.md");

const commands = list("commands").filter(entry => entry.name.endsWith(".md")).map(entry => entry.name.slice(0, -3));
const agents = list("agents").filter(entry => entry.name.endsWith(".md")).map(entry => entry.name.slice(0, -3));
const skills = list("skills").filter(entry => entry.isDirectory() && existsSync(resolve(root, "skills", entry.name, "SKILL.md"))).map(entry => entry.name);
const plugins = list("plugins").filter(entry => entry.isFile()).map(entry => entry.name);

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const slashCommand = name => new RegExp(`(?:^|[^\\w/-])/${escape(name)}(?![\\w-])`);

const anyOf = checks => checks.some(Boolean);

const mentions = {
  command: (text, name) => anyOf([slashCommand(name).test(text), text.includes(`commands/${name}.md`)]),
  agent: (text, name) => anyOf([text.includes(`\`${name}\``), text.includes(`agents/${name}.md`)]),
  skill: (text, name) => anyOf([text.includes(`\`${name}\``), text.includes(`skills/${name}`)]),
  plugin: (text, file) => text.includes(file),
};

const inventory = [
  ["command", commands],
  ["agent", agents],
  ["skill", skills],
  ["plugin", plugins],
];

test("the repository still has the surfaces this test guards", () => {
  for (const [kind, names] of inventory) assert.ok(names.length > 0, `expected at least one ${kind}`);
});

test("the cheat sheet mentions every command, agent, skill, and plugin", () => {
  const missing = [];
  for (const [kind, names] of inventory) {
    for (const name of names) if (!mentions[kind](cheatSheet, name)) missing.push(`${kind} ${name}`);
  }
  assert.deepEqual(missing, [], `add these to the cheat sheet: ${missing.join(", ")}`);
});

test("the cheat sheet only names commands that exist", () => {
  const named = new Set([...cheatSheet.matchAll(/`\/([a-z][a-z0-9-]*)[\s`\]]/g)].map(match => match[1]));
  const unknown = [...named].filter(name => !commands.includes(name));
  assert.deepEqual(unknown, [], `unknown commands in the cheat sheet: ${unknown.join(", ")}`);
});

test("the cheat sheet links resolve", () => {
  const targets = [...cheatSheet.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map(match => match[1]).filter(target => !/^https?:/.test(target));
  assert.ok(targets.length > 0, "expected relative links");
  for (const target of targets) assert.ok(existsSync(resolve(root, "docs", target)), `broken link: ${target}`);
});
