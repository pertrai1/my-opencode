import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import plugin from '../plugins/rtk.ts';

const agentRule = { action: 'shell', resource: '*', effect: 'allow' };
const sessionRule = { action: 'shell', resource: 'git show *', effect: 'ask' };

async function setup(t, response, { supporting = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-test-'));
  fs.mkdirSync(path.join(directory, 'nested'));
  const log = path.join(directory, 'hook.json');
  fs.writeFileSync(path.join(directory, 'rtk'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args.join(' ') === 'hook opencode --help') process.exit(${supporting ? 0 : 2});
const config = process.env.OPENCODE_CONFIG;
fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({
  args, config, permissions: config ? JSON.parse(fs.readFileSync(config)).permissions : [],
}));
${response}
`, { mode: 0o700 });
  const previous = { PATH: process.env.PATH, RTK_DISABLED: process.env.RTK_DISABLED };
  process.env.PATH = `${directory}${path.delimiter}${previous.PATH}`;
  delete process.env.RTK_DISABLED;
  t.after(() => {
    process.env.PATH = previous.PATH;
    if (previous.RTK_DISABLED === undefined) delete process.env.RTK_DISABLED;
    else process.env.RTK_DISABLED = previous.RTK_DISABLED;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const hooks = {};
  await plugin.setup({
    location: { directory },
    tool: { hook: async (name, handler) => { hooks[name] = handler; } },
    agent: { get: async ({ agentID, location }) => {
      assert.equal(agentID, 'build');
      assert.deepEqual(location, { directory });
      return { data: { permissions: [agentRule] } };
    } },
    session: { get: async ({ sessionID }) => {
      assert.equal(sessionID, 'session');
      return { permissions: [sessionRule] };
    } },
  });
  return { hooks, readInvocation: () => JSON.parse(fs.readFileSync(log, 'utf8')) };
}

const call = (tool = 'shell') => ({
  tool, sessionID: 'session', agent: 'build', messageID: 'message', id: 'call',
  input: { command: 'git status --short', workdir: 'nested' },
});

for (const tool of ['shell', 'bash']) {
  test(`RTK uses the OpenCode hook with ordered effective permissions for ${tool}`, async t => {
    const { hooks, readInvocation } = await setup(t, 'console.log(JSON.stringify({command:"rtk git status --short"}));');
    const event = call(tool);
    await hooks['execute.before'](event);

    assert.deepEqual(event.input, { command: 'rtk git status --short', workdir: 'nested' });
    const invocation = readInvocation();
    assert.deepEqual(invocation.args, ['hook', 'opencode', '--', 'git status --short']);
    assert.deepEqual(invocation.permissions, [agentRule, sessionRule]);
    assert.equal(fs.existsSync(invocation.config), false);
  });
}

for (const [label, response] of [
  ['no rewrite', 'console.log("{}");'],
  ['invalid JSON', 'console.log("not JSON");'],
  ['non-string command', 'console.log(JSON.stringify({command:4}));'],
  ['CLI error despite valid output', 'console.log(JSON.stringify({command:"rtk git status"})); process.exit(9);'],
  ['unreadable permissions', 'console.error("cannot read policy"); console.log(JSON.stringify({command:"rtk git status"}));'],
]) {
  test(`RTK preserves the original command on ${label}`, async t => {
    const { hooks } = await setup(t, response);
    const event = call();
    await hooks['execute.before'](event);
    assert.equal(event.input.command, 'git status --short');
  });
}

test('RTK disables rewriting when the OpenCode hook is missing', async t => {
  const { hooks } = await setup(t, '', { supporting: false });
  assert.equal(hooks['execute.before'], undefined);
});

test('RTK respects the OpenCode process opt-out', async t => {
  const { hooks, readInvocation } = await setup(t, 'console.log(JSON.stringify({command:"rtk git status"}));');
  process.env.RTK_DISABLED = '1';
  const event = call();
  await hooks['execute.before'](event);
  assert.equal(event.input.command, 'git status --short');
  assert.throws(readInvocation, { code: 'ENOENT' });
});

test('RTK timeout preserves the original command even when the CLI ignores SIGTERM', async t => {
  const { hooks } = await setup(t, `
process.on('SIGTERM', () => {});
console.log(JSON.stringify({command:"rtk git status"}));
setTimeout(() => process.exit(0), 20_000);
`);
  const event = call();
  const started = performance.now();
  await hooks['execute.before'](event);
  assert.equal(event.input.command, 'git status --short');
  assert.ok(performance.now() - started < 15_000, 'a stalled RTK must release the shell hook');
});
