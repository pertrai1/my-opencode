import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import rtkPlugin from '../plugins/rtk.ts';
import graphPlugin from '../plugins/crg-plugin.ts';
import atuinPlugin from '../plugins/atuin.ts';

// Run the registered hooks against each other, faking the optional CLIs on PATH.
async function setup(t) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-plugins-bin-'));
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shell-plugins-repo-')));
  const repository = path.join(directory, 'target');
  const workdir = path.join(repository, 'nested');
  fs.mkdirSync(workdir, { recursive: true });
  execFileSync('git', ['init', '--quiet'], { cwd: repository });
  fs.writeFileSync(path.join(bin, 'rtk'), `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[2] !== '--help') console.log(JSON.stringify({command: 'rtk ' + args[3]}));
`, { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'code-review-graph'), '#!/bin/sh\nif [ "$1" = status ]; then printf \'{"files":1,"built_at_commit":"same","current_sha":"same","built_on_branch":"main","current_branch":"main"}\n\'; exit 0; fi\necho "$*" >> graph-calls.log\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'atuin'), `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync('atuin-calls.log', args.join(' ') + '\\n');
appendFileSync('atuin-pwd.log', process.env.PWD + '\\n');
if (args[1] === 'start') process.stdout.write('history-id\\n');
`, { mode: 0o700 });
  const previousPath = process.env.PATH;
  const previousPwd = process.env.PWD;
  const previousRtkDisabled = process.env.RTK_DISABLED;
  process.env.PATH = `${bin}:${previousPath}`;
  process.env.PWD = directory;
  delete process.env.RTK_DISABLED;
  t.after(() => {
    process.env.PATH = previousPath;
    if (previousPwd === undefined) delete process.env.PWD;
    else process.env.PWD = previousPwd;
    if (previousRtkDisabled === undefined) delete process.env.RTK_DISABLED;
    else process.env.RTK_DISABLED = previousRtkDisabled;
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const hooks = {};
  for (const [name, plugin] of [['rtk', rtkPlugin], ['graph', graphPlugin], ['atuin', atuinPlugin]]) {
    hooks[name] = {};
    await plugin.setup({
      location: { directory },
      tool: { hook: async (hook, handler) => { hooks[name][hook] = handler; } },
      event: { subscribe: () => [] },
      agent: { get: async () => ({ data: { permissions: [] } }) },
      session: { get: async () => ({}) },
    });
  }
  return { repository, workdir, hooks };
}

for (const order of [['rtk', 'graph', 'atuin'], ['atuin', 'graph', 'rtk']]) {
  test(`shell hooks agree on the explicit working directory (${order.join(', ')})`, async (t) => {
    const { repository, workdir, hooks } = await setup(t);
    const event = { tool: 'shell', agent: 'build', sessionID: 'session', id: 'call', input: { command: 'git commit -m fix', workdir: 'target/nested' } };
    for (const name of order) await hooks[name]['execute.before'](event);
    await hooks.atuin['execute.after']({ ...event, status: 'completed', result: { metadata: { exit: 0 } } });
    assert.equal(event.input.command, 'rtk git commit -m fix');
    assert.equal(event.input.workdir, 'target/nested');
    assert.equal(fs.readFileSync(path.join(repository, 'graph-calls.log'), 'utf8'), 'detect-changes --brief\n');
    const recorded = order.at(0) === 'rtk' ? 'rtk git commit -m fix' : 'git commit -m fix';
    assert.equal(fs.readFileSync(path.join(workdir, 'atuin-calls.log'), 'utf8'),
      `history start --author opencode --author-kind agent -- ${recorded}\nhistory end history-id --exit 0\n`);
    assert.equal(fs.readFileSync(path.join(workdir, 'atuin-pwd.log'), 'utf8'), `${workdir}\n${workdir}\n`);
  });
}
