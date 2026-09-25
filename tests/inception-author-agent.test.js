const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matches(pattern, value) {
  const source = escapeRegExp(pattern).replace(/\\\*\\\*\//g, '(?:.*/)?').replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${source}$`).test(value);
}

function commandMatches(pattern, value) {
  const source = escapeRegExp(pattern).replace(/\\\*/g, '.*');
  return new RegExp(`^${source}$`).test(value);
}

function loadRules() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'agents', 'inception-author.md'), 'utf8');
  const frontMatter = source.match(/^---\n([\s\S]*?)\n---/)[1];
  const rulePattern = /^ {2}- action: ("[^"]+")\n {4}resource: ("[^"]+")\n {4}effect: (allow|deny|ask)$/gm;
  return [...frontMatter.matchAll(rulePattern)].map(([, action, resource, effect]) => ({
    action: JSON.parse(action),
    resource: JSON.parse(resource),
    effect,
  }));
}

function effect(rules, action, resource, match) {
  return rules.reduce(
    (result, rule) => (rule.action === action && match(rule.resource, resource) ? rule.effect : result),
    'deny',
  );
}

test('inception-author edits only inception artifacts', () => {
  const rules = loadRules();
  const edit = (file) => effect(rules, 'edit', file, matches);
  const id = 'wi-20260925T120000Z-intent-a1b2c3d4';

  assert.equal(edit(`/repo/.agents/work/${id}/inception/units.md`), 'allow');
  assert.equal(edit(`/repo/.agents/work/${id}/work.json`), 'deny');
  assert.equal(edit(`/repo/.agents/work/${id}/progress.md`), 'deny');
  assert.equal(edit('/repo/openspec/changes/add-checkout/proposal.md'), 'deny');
  assert.equal(edit('/repo/src/index.ts'), 'deny');
});

test('inception-author has no shell access', () => {
  const rules = loadRules();
  const shell = (command) => effect(rules, 'shell', command, commandMatches);
  const script = 'node ~/.config/opencode/scripts/work-item.mjs';

  assert.equal(shell(`${script} show wi-x`), 'deny');
  assert.equal(shell(`${script} add-unit wi-x --name Checkout`), 'deny');
  assert.equal(shell(`${script} add-unit wi-x --name Checkout && rm -rf .agents`), 'deny');
  assert.equal(shell(`${script} approve-inception wi-x`), 'deny');
  assert.equal(shell(`${script} link-unit wi-x u-checkout --change add-checkout`), 'deny');
  assert.ok(rules.every((rule) => rule.action !== 'shell' || rule.effect === 'deny'), 'Expected no shell allow rules');
});
