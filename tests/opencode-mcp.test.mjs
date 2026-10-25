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
  return { servers, permissions: config.permissions, agents: config.agents };
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

function agentFileRules(filename) {
  const frontMatter = fs.readFileSync(filename, 'utf8').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  const rulePattern = /^ {2}- action: "([^"]+)"\n {4}resource: "([^"]+)"\n {4}effect: (allow|deny|ask)$/gm;
  return [...frontMatter.matchAll(rulePattern)].map(([, action, resource, effect]) => ({ action, resource, effect }));
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

test('npx and Docker servers run pinned releases', async () => {
  const { servers } = await loadConfig();
  const launchers = Object.entries(servers).filter(([, server]) => ['npx', 'docker'].includes(server.command?.[0]));
  assert.ok(launchers.length > 0);
  for (const [name, { command: [launcher, ...args] }] of launchers) {
    if (launcher === 'npx') {
      const spec = args.find((arg) => arg.startsWith('--package='))?.slice('--package='.length)
        ?? args.find((arg) => !arg.startsWith('-'));
      assert.match(spec, /^(@[^/@]+\/)?[^/@]+@\d+\.\d+\.\d+$/, `${name} must pin an exact npm version`);
    } else {
      const image = args.findLast((arg) => !arg.startsWith('-'));
      assert.match(image, /@sha256:[0-9a-f]{64}$/, `${name} must pin an image digest`);
      assert.ok(!args.some((arg) => arg.startsWith('--pull')), `${name} must not pull a newer image`);
    }
  }
});

test('the CodeScene guide and skill describe the configured registration', async () => {
  const { servers } = await loadConfig();
  const { command, environment } = servers.codescene;
  const tokenFile = environment.CS_ACCESS_TOKEN.match(/^\{file:(.+)\}$/)?.[1];
  assert.ok(tokenFile, 'the token comes from a file');
  const guide = fs.readFileSync(new URL('../docs/codescene-setup.md', import.meta.url), 'utf8');
  const skill = fs.readFileSync(new URL('../skills/codescene-mcp/SKILL.md', import.meta.url), 'utf8');
  assert.ok(guide.includes(command.join(' ')), 'guide names the launch command');
  assert.ok(guide.includes(tokenFile), 'guide names the token file');
  assert.ok(skill.includes(tokenFile), 'skill names the token file');
});

test('chrome-devtools opts out of usage statistics and uses a temporary profile', async () => {
  const { servers } = await loadConfig();
  const { command } = servers['chrome-devtools'];
  assert.ok(command.includes('--no-usage-statistics'));
  assert.ok(command.includes('--isolated'));
});

test('only the explore agent can see the explore graph server', async () => {
  const { permissions } = await loadConfig();
  assert.equal(effectOf(permissions, 'code-review-graph-explore_list_graph_stats_tool'), 'deny');
  assert.equal(effectOf(permissions, 'code-review-graph_list_graph_stats_tool'), 'allow');
});

test('only build can apply graph refactors, which bypass edit path rules', async () => {
  const { permissions, agents } = await loadConfig();
  const action = 'code-review-graph_apply_refactor_tool';
  assert.equal(effectOf(permissions, action), 'deny');
  assert.equal(effectOf(permissions, 'code-review-graph_refactor_tool'), 'allow', 'previews stay available');
  for (const [name, agent] of Object.entries(agents)) {
    const expected = name === 'build' ? 'allow' : 'deny';
    assert.equal(effectOf([...permissions, ...(agent.permissions ?? [])], action), expected, `${name} agent`);
  }
  const agentDirectory = fileURLToPath(new URL('../agents/', import.meta.url));
  for (const file of fs.readdirSync(agentDirectory).filter((entry) => entry.endsWith('.md'))) {
    const rules = [...permissions, ...agentFileRules(path.join(agentDirectory, file))];
    assert.ok(rules.length > permissions.length, `agents/${file} rules were not parsed`);
    assert.equal(effectOf(rules, action), 'deny', `agents/${file}`);
  }
});
