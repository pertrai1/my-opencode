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
  fs.writeFileSync(path.join(bin, 'rtk'), '#!/bin/sh\npwd > rewrite-cwd.log\nprintf "rtk %s\\n" "$2"\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'code-review-graph'), '#!/bin/sh\nif [ "$1" = status ]; then printf \'{"files":1,"built_at_commit":"same","current_sha":"same","built_on_branch":"main","current_branch":"main"}\n\'; exit 0; fi\necho "$*" >> graph-calls.log\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'atuin'), '#!/bin/sh\nprintf "%s\\n" "$*" >> atuin-calls.log\nif [ "$2" = start ]; then printf "history-id\\n"; fi\n', { mode: 0o700 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath}`;
  t.after(() => {
    process.env.PATH = previousPath;
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const hooks = {};
  for (const [name, plugin] of [['rtk', rtkPlugin], ['graph', graphPlugin], ['atuin', atuinPlugin]]) {
    hooks[name] = {};
    await plugin.setup({
      location: { directory },
      tool: { hook: async (hook, handler) => { hooks[name][hook] = handler; } },
    });
  }
  return { repository, workdir, hooks };
}

for (const order of [['rtk', 'graph', 'atuin'], ['atuin', 'graph', 'rtk']]) {
  test(`shell hooks agree on the explicit working directory (${order.join(', ')})`, async (t) => {
    const { repository, workdir, hooks } = await setup(t);
    const event = { tool: 'shell', sessionID: 'session', id: 'call', input: { command: 'git commit -m fix', workdir: 'target/nested' } };
    for (const name of order) await hooks[name]['execute.before'](event);
    await hooks.atuin['execute.after']({ ...event, status: 'completed', result: { metadata: { exit: 0 } } });
    assert.equal(event.input.command, 'rtk git commit -m fix');
    assert.equal(fs.readFileSync(path.join(workdir, 'rewrite-cwd.log'), 'utf8').trim(), workdir);
    assert.equal(fs.readFileSync(path.join(repository, 'graph-calls.log'), 'utf8'), 'detect-changes --brief\n');
    const recorded = order.at(0) === 'rtk' ? 'rtk git commit -m fix' : 'git commit -m fix';
    assert.equal(fs.readFileSync(path.join(workdir, 'atuin-calls.log'), 'utf8'),
      `history start --author opencode --author-kind agent -- ${recorded}\nhistory end history-id --exit 0\n`);
  });
}
