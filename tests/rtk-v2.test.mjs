import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import plugin from '../plugins/rtk.ts';

async function setup(t, code, script) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rtk-test-'));
  fs.writeFileSync(path.join(directory, 'rtk'), script ?? (code === 'cwd' ? '#!/bin/sh\npwd\n' : `#!/bin/sh\nprintf 'rtk git status\\n'\nexit ${code}\n`), { mode: 0o700 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${directory}:${previousPath}`;
  t.after(() => { process.env.PATH = previousPath; fs.rmSync(directory, { recursive: true, force: true }); });
  const hooks = {};
  await plugin.setup({
    location: { directory: os.tmpdir() },
    tool: { hook: async (name, handler) => { hooks[name] = handler; } },
  });
  return hooks;
}

const call = () => ({ tool: 'shell', sessionID: 'session', messageID: 'message', id: 'call', input: { command: 'git status' } });

test('RTK explicit deny blocks execution instead of running the original command', async (t) => {
  const hooks = await setup(t, 2);
  await assert.rejects(hooks['execute.before'](call()), /RTK denied/);
});

test('RTK ask preserves the original command and leaves approval to native permissions', async (t) => {
  const hooks = await setup(t, 3);
  const event = call();
  await hooks['execute.before'](event);
  assert.equal(event.input.command, 'git status');
  assert.equal(hooks.permission, undefined);
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

test('RTK timeout preserves the original command even when the CLI ignores SIGTERM', async (t) => {
  const hooks = await setup(t, undefined, `#!/usr/bin/env node
process.on('SIGTERM', () => {});
process.stdout.write('rtk git status\\n');
setTimeout(() => process.exit(0), 20_000);
`);
  const event = call();
  const started = performance.now();
  await hooks['execute.before'](event);
  assert.equal(event.input.command, 'git status');
  assert.ok(performance.now() - started < 15_000, 'a stalled RTK must release the shell hook');
});
