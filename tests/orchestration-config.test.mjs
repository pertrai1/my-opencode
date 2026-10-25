import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import yaml from 'js-yaml';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const agent = (name) => yaml.load(read(`agents/${name}.md`).split('---')[1]);

test('SDLC can delegate to TDD while direct TDD entry and worker permissions remain intact', async () => {
  const { config, error } = ts.parseConfigFileTextToJson('opencode.jsonc', read('opencode.jsonc'));
  assert.equal(error, undefined);
  const schemaRequire = createRequire(import.meta.resolve('@opencode/schema/config/experimental'));
  const { Schema } = await import(schemaRequire.resolve('effect'));
  const { ConfigExperimental } = await import('@opencode/schema/config/experimental');
  const { ConfigAgent } = await import(new URL('./agent.js', import.meta.resolve('@opencode/schema/config/experimental')));
  Schema.decodeUnknownSync(ConfigExperimental.Info, { onExcessProperty: 'error' })({
    subagent_depth: config.experimental.subagent_depth,
  });
  assert.equal(config.experimental.subagent_depth, 2);
  const sdlc = agent('sdlc-orchestrator');
  const tdd = Schema.decodeUnknownSync(ConfigAgent.Info, { onExcessProperty: 'error' })(agent('tdd-orchestrator'));
  assert.equal(tdd.mode, 'all');
  const rules = (definition) => definition.permissions.filter(({ action }) => action === 'subagent');
  const decision = (definition, target) => rules(definition)
    .filter(({ resource }) => resource === '*' || resource === target).at(-1)?.effect;
  assert.equal(decision(sdlc, 'tdd-orchestrator'), 'allow');
  assert.match(read('agents/sdlc-orchestrator.md'), /Delegate behavioral work through `tdd-orchestrator`/);
  assert.deepEqual(rules(tdd).filter(({ effect }) => effect === 'allow').map(({ resource }) => resource).sort(),
    ['implementer', 'test-author', 'type-author']);
  for (const name of ['type-author', 'test-author', 'implementer']) {
    assert.equal(decision(tdd, name), 'allow');
    assert.ok(['subagent', 'all'].includes(agent(name).mode), `${name} must be callable`);
  }
  assert.equal(decision(tdd, 'unapproved-worker'), 'deny');
});
