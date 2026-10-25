import assert from 'node:assert/strict';
import { test } from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import rtkPlugin from '../plugins/rtk.ts';
import graphPlugin from '../plugins/crg-plugin.ts';

// Run the real RTK and graph hooks against each other, faking only both CLIs on PATH.
async function setup(t) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-plugins-bin-'));
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'shell-plugins-repo-')));
  fs.writeFileSync(path.join(bin, 'rtk'), '#!/bin/sh\nprintf "rtk %s\\n" "$2"\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'code-review-graph'), '#!/bin/sh\necho "$*" >> graph-calls.log\n', { mode: 0o700 });
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath}`;
  t.after(() => {
    process.env.PATH = previousPath;
    fs.rmSync(bin, { recursive: true, force: true });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const hooks = {};
  for (const [name, plugin] of [['rtk', rtkPlugin], ['graph', graphPlugin]]) {
    hooks[name] = {};
    await plugin.setup({
      location: { directory },
      tool: { hook: async (hook, handler) => { hooks[name][hook] = handler; } },
    });
  }
  return { directory, hooks };
}

for (const [first, second] of [['rtk', 'graph'], ['graph', 'rtk']]) {
  test(`graph analysis sees a commit when the ${first} hook runs first`, async (t) => {
    const { directory, hooks } = await setup(t);
    const event = { tool: 'shell', input: { command: 'git commit -m fix' } };
    for (const name of [first, second]) await hooks[name]['execute.before'](event);
    assert.equal(event.input.command, 'rtk git commit -m fix');
    assert.equal(fs.readFileSync(path.join(directory, 'graph-calls.log'), 'utf8'), 'detect-changes --brief\n');
  });
}
