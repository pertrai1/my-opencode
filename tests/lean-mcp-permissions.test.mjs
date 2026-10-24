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

test('lean denies the registered MCP names with hyphens preserved', async () => {
  const config = readConfig();
  const schemaRequire = createRequire(import.meta.resolve('@opencode/schema/config/agent'));
  const { Schema } = await import(schemaRequire.resolve('effect'));
  const { ConfigAgent } = await import('@opencode/schema/config/agent');
  const lean = Schema.decodeUnknownSync(ConfigAgent.Info, { onExcessProperty: 'error' })(config.agents.lean);

  for (const [server, tool] of restrictedTools) {
    assert.ok(config.mcp.servers[server], `missing server: ${server}`);
    const action = `${server}_${tool}`;
    assert.deepEqual(lean.permissions.filter(rule => rule.action === action), [
      { action, resource: '*', effect: 'deny' },
    ], `missing exact deny for registered tool: ${action}`);
    const obsoleteAlias = action.replaceAll('-', '_');
    if (obsoleteAlias !== action) {
      assert.ok(!lean.permissions.some(rule => rule.action === obsoleteAlias),
        `obsolete underscore alias for ${action}`);
    }
  }
});

test('dormant memory restrictions remain explicit without registering a memory server', () => {
  const config = readConfig();
  assert.equal(config.mcp.servers.agentmemory, undefined);
  const actions = ['audit', 'export', 'governance_delete', 'recall', 'save', 'sessions', 'smart_search'];
  for (const suffix of actions) {
    const action = `agentmemory_memory_${suffix}`;
    assert.deepEqual(config.agents.lean.permissions.find(rule => rule.action === action),
      { action, resource: '*', effect: 'deny' });
  }
});
