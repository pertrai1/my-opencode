import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

test('ordinary lean sessions enable todos and permit task-state updates', async () => {
  const source = readFileSync(new URL('../opencode.jsonc', import.meta.url), 'utf8');
  const { config, error } = ts.parseConfigFileTextToJson('opencode.jsonc', source);
  assert.equal(error, undefined);
  // V2 config docs/OpenAPI define todo as boolean; the installed experimental
  // schema snapshot predates this field. Live verification covers tool exposure.
  assert.equal(config.experimental.todo, true);
  assert.equal(config.default_agent, 'lean');
  const schemaRequire = createRequire(import.meta.resolve('@opencode/schema/config/agent'));
  const { Schema } = await import(schemaRequire.resolve('effect'));
  const { ConfigAgent } = await import('@opencode/schema/config/agent');
  const lean = Schema.decodeUnknownSync(ConfigAgent.Info, { onExcessProperty: 'error' })(config.agents.lean);
  const rules = [...config.permissions, ...lean.permissions]
    .filter(rule => ['todowrite', '*'].includes(rule.action) && rule.resource === '*');
  assert.equal(rules.at(-1)?.effect, 'allow');
});
