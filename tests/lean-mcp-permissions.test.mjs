import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

// Registered server/tool names observed in the live V2 catalog, 2026-10-24.
const restrictedTools = [
  ['mdn', 'search'],
  ['mdn', 'get-doc'],
  ['mdn', 'get-compat'],
  ['llm-core', 'get_active_instructions'],
  ['llm-core', 'lint_file'],
];

function readConfig() {
  const source = readFileSync(new URL('../opencode.jsonc', import.meta.url), 'utf8');
  const { config, error } = ts.parseConfigFileTextToJson('opencode.jsonc', source);
  assert.equal(error, undefined);
  return config;
}

async function leanRules(config) {
  const schemaRequire = createRequire(import.meta.resolve('@opencode/schema/config/agent'));
  const { Schema } = await import(schemaRequire.resolve('effect'));
  const { ConfigAgent } = await import('@opencode/schema/config/agent');
  return Schema.decodeUnknownSync(ConfigAgent.Info, { onExcessProperty: 'error' })(config.agents.lean).permissions;
}

function matches(pattern, value) {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${source}$`).test(value);
}

// Agent rules follow global rules, and the last matching rule wins.
function effectOf(rules, action) {
  return rules.reduce(
    (result, rule) => (matches(rule.action, action) && matches(rule.resource, '*') ? rule.effect : result),
    'allow',
  );
}

test('lean denies whole restricted servers, including tools they add later', async () => {
  const config = readConfig();
  const lean = await leanRules(config);
  const rules = [...config.permissions, ...lean];
  for (const server of new Set(restrictedTools.map(([name]) => name))) {
    assert.ok(config.mcp.servers[server], `missing server: ${server}`);
    assert.deepEqual(lean.filter(rule => rule.action.startsWith(`${server}_`)), [
      { action: `${server}_*`, resource: '*', effect: 'deny' },
    ], `${server} needs one wildcard deny`);
    assert.equal(effectOf(rules, `${server}_future-tool`), 'deny');
  }
  for (const [server, tool] of restrictedTools) {
    assert.equal(effectOf(rules, `${server}_${tool}`), 'deny', `${server}_${tool}`);
  }
  assert.equal(effectOf(rules, 'context7_resolve-library-id'), 'allow', 'Context7 stays available');
});

test('dormant memory restrictions remain explicit without registering a memory server', async () => {
  const config = readConfig();
  assert.equal(config.mcp.servers.agentmemory, undefined);
  const lean = await leanRules(config);
  assert.deepEqual(lean.filter(rule => rule.action.startsWith('agentmemory_')), [
    { action: 'agentmemory_*', resource: '*', effect: 'deny' },
  ]);
});
