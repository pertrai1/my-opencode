import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import plugin from '../plugins/rtk.ts';

async function setup(t, code) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-test-'));
  fs.writeFileSync(path.join(directory, 'rtk'), code === 'cwd' ? '#!/bin/sh\npwd\n' : `#!/bin/sh\nprintf 'rtk git status\\n'\nexit ${code}\n`, { mode: 0o700 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${directory}:${previousPath}`;
  t.after(() => { process.env.PATH = previousPath; fs.rmSync(directory, { recursive: true, force: true }); });
  const hooks = {};
  await plugin.setup({
    location: { directory: os.tmpdir() },
    tool: { hook: async (name, handler) => { hooks[name] = handler; } },
    permission: { hook: async (_name, handler) => { hooks.permission = handler; } },
  });
  return hooks;
}

const call = () => ({ tool: 'shell', sessionID: 'session', messageID: 'message', id: 'call', input: { command: 'git status' } });

test('RTK explicit deny blocks execution instead of running the original command', async (t) => {
  const hooks = await setup(t, 2);
  await assert.rejects(hooks['execute.before'](call()), /RTK denied/);
});

test('RTK ask preserves the original permission target and asks only for its own call', async (t) => {
  const hooks = await setup(t, 3);
  const event = call();
  await hooks['execute.before'](event);
  assert.equal(event.input.command, 'git status');
  const evaluation = () => ({ sessionID: event.sessionID, action: 'shell', source: { type: 'tool', messageID: event.messageID, id: event.id }, effect: 'allow' });
  const matching = evaluation();
  await hooks.permission(matching);
  assert.equal(matching.effect, 'ask');
  const unrelated = { ...evaluation(), sessionID: 'another-session' };
  await hooks.permission(unrelated);
  assert.equal(unrelated.effect, 'allow');
  const denied = { ...evaluation(), effect: 'deny' };
  await hooks.permission(denied);
  assert.equal(denied.effect, 'deny');
  await hooks['execute.after']({ ...event, status: 'completed' });
  const finished = evaluation();
  await hooks.permission(finished);
  assert.equal(finished.effect, 'allow');
});

for (const [code, expected] of [[0, 'rtk git status'], [1, 'git status'], [9, 'git status']]) {
  test(`RTK exit ${code} leaves the expected command for native execution`, async (t) => {
    const hooks = await setup(t, code);
    const event = call();
    await hooks['execute.before'](event);
    assert.equal(event.input.command, expected);
  });
}


test('RTK evaluates project rules in the session repository', async (t) => {
  const hooks = await setup(t, 'cwd');
  const event = call();
  await hooks['execute.before'](event);
  assert.equal(event.input.command, os.tmpdir());
});

test('RTK fails closed if interrupted calls exhaust pending approval tracking', async (t) => {
  const hooks = await setup(t, 3);
  for (let index = 0; index < 1024; index += 1) {
    await hooks['execute.before']({ ...call(), id: String(index) });
  }
  await assert.rejects(hooks['execute.before']({ ...call(), id: 'overflow' }), /pending approvals/);
  const first = { sessionID: 'session', action: 'shell', source: { type: 'tool', messageID: 'message', id: '0' }, effect: 'allow' };
  await hooks.permission(first);
  assert.equal(first.effect, 'ask');
});
