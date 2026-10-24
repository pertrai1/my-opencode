import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createRequire } from 'node:module';

async function loadConfig() {
  const schemaRequire = createRequire(import.meta.resolve('@opencode/schema/config/mcp'));
  const { Schema } = await import(schemaRequire.resolve('effect'));
  const { ConfigMCP } = await import('@opencode/schema/config/mcp');
  const filename = fileURLToPath(new URL('../opencode.jsonc', import.meta.url));
  const { config, error } = ts.parseConfigFileTextToJson(filename, fs.readFileSync(filename, 'utf8'));
  assert.equal(error, undefined);
  const { servers } = Schema.decodeUnknownSync(ConfigMCP.Info, { onExcessProperty: 'error' })(config.mcp);
  return { servers, permissions: config.permissions };
}

function matches(pattern, value) {
  const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${source}$`).test(value);
}

test('MCP servers load through the v2 schema with both code graph servers enabled', async () => {
  const { servers } = await loadConfig();
  for (const name of ['code-review-graph', 'code-review-graph-explore']) {
    assert.equal(servers[name].cwd, undefined, `${name} must start in each session workspace`);
    assert.notEqual(servers[name].disabled, true, `${name} must be enabled`);
  }
  assert.deepEqual(servers['code-review-graph-explore'].command, ['code-review-graph', 'mcp']);
  assert.equal(servers['code-review-graph-explore'].codemode, false, 'explore cannot use Code Mode');
});

test('the main graph server watches files only inside a git repository', async (t) => {
  const { servers } = await loadConfig();
  const [shell, ...args] = servers['code-review-graph'].command;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-server-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'code-review-graph'), '#!/bin/sh\necho "$@"\n', { mode: 0o700 });
  const repo = path.join(root, 'repo');
  const plain = path.join(root, 'plain');
  fs.mkdirSync(repo);
  fs.mkdirSync(plain);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const run = (cwd) => execFileSync(shell, args, { cwd, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }).toString().trim();
  assert.equal(run(repo), 'mcp --auto-watch');
  assert.equal(run(plain), 'mcp');
});

test('only the explore agent can see the explore graph server', async () => {
  const { permissions } = await loadConfig();
  const effect = (action) => permissions.reduce(
    (result, rule) => (matches(rule.action, action) && matches(rule.resource, '*') ? rule.effect : result),
    'allow',
  );
  assert.equal(effect('code-review-graph-explore_list_graph_stats_tool'), 'deny');
  assert.equal(effect('code-review-graph_list_graph_stats_tool'), 'allow');
});
