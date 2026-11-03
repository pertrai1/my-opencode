import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import yaml from 'js-yaml';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('opencode.jsonc', root), 'utf8');
const { config, error } = ts.parseConfigFileTextToJson('opencode.jsonc', source);
assert.equal(error, undefined);
const schemaRequire = createRequire(import.meta.resolve('@opencode/schema/config'));
const { Schema } = await import(schemaRequire.resolve('effect'));
const { Permission } = await import('@opencode/schema/permission');
const validateRules = Schema.decodeUnknownSync(Permission.Ruleset, { onExcessProperty: 'error' });
validateRules(config.permissions);

// Static policy regression checks, not evidence of tool boundary enforcement.
function matches(pattern, value) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`).test(value);
}

function effect(rules, action, resource) {
  return rules.reduce((result, rule) =>
    matches(rule.action, action) && matches(rule.resource, resource) ? rule.effect : result, 'allow');
}

function agentRules() {
  const entries = Object.entries(config.agents).map(([id, agent]) => [id, agent.permissions ?? []]);
  for (const name of readdirSync(new URL('agents/', root)).filter(name => name.endsWith('.md'))) {
    const text = readFileSync(new URL(`agents/${name}`, root), 'utf8');
    const frontMatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(frontMatter, `${name} needs front matter`);
    entries.push([name, yaml.load(frontMatter[1]).permissions ?? []]);
  }
  return entries;
}

test('shared external access requires approval without changing ordinary file permissions', () => {
  assert.deepEqual(config.permissions.filter(rule => rule.action === 'external_directory'), [
    { action: 'external_directory', resource: '*', effect: 'ask' },
  ]);
  for (const boundary of ['/tmp/reference/*', '/Users/rob/reference/*', 'C:/Users/rob/reference/*']) {
    assert.equal(effect(config.permissions, 'external_directory', boundary), 'ask', boundary);
  }
  for (const action of ['read', 'edit', 'shell']) {
    const resource = action === 'shell' ? 'cat README.md' : 'src/example.ts';
    assert.equal(effect(config.permissions, action, resource), 'allow');
  }
  assert.equal(effect(config.permissions, 'read', '.env'), 'deny');
  assert.equal(effect(config.permissions, 'read', '.env.example'), 'allow');
  assert.equal(effect(config.permissions, 'shell', 'rm example.txt'), 'deny');
});

test('every configured agent preserves the shared boundary, with explore still denied', () => {
  for (const [id, rules] of agentRules()) {
    validateRules(rules);
    const expected = id === 'explore.md' ? 'deny' : 'ask';
    for (const boundary of ['/tmp/reference/*', 'C:/Users/rob/reference/*']) {
      assert.equal(effect([...config.permissions, ...rules], 'external_directory', boundary), expected, id);
    }
  }
});
