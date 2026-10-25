import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

test('the default lean agent can search and retrieve sources with automatic provider selection', async () => {
  const source = readFileSync(new URL('../opencode.jsonc', import.meta.url), 'utf8');
  const { config, error } = ts.parseConfigFileTextToJson('opencode.jsonc', source);
  assert.equal(error, undefined);
  const schemaRequire = createRequire(import.meta.resolve('@opencode/schema/config/agent'));
  const { Schema } = await import(schemaRequire.resolve('effect'));
  const { ConfigAgent } = await import('@opencode/schema/config/agent');
  const { ConfigWebSearch } = await import('@opencode/schema/config/websearch');
  const lean = Schema.decodeUnknownSync(ConfigAgent.Info, { onExcessProperty: 'error' })(config.agents.lean);
  const search = Schema.decodeUnknownSync(ConfigWebSearch.Selection, { onExcessProperty: 'error' })(config.websearch);
  assert.equal(config.default_agent, 'lean');
  assert.equal(search.provider, 'random');
  for (const action of ['websearch', 'webfetch']) {
    const rules = [...config.permissions, ...lean.permissions]
      .filter(rule => [action, '*'].includes(rule.action) && rule.resource === '*');
    assert.equal(rules.at(-1)?.effect, 'allow', `${action} must be available to lean`);
  }
});
