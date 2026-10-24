import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isShellTool, splitChainedCommands, withoutComments, withoutRtkPrefix } from '../lib/shell-command.ts';

test('recognizes only V1 and V2 shell tool IDs', () => {
  for (const tool of ['bash', 'shell', 'Shell']) assert.equal(isShellTool(tool), true, tool);
  for (const tool of ['edit', 'shellcheck', undefined]) assert.equal(isShellTool(tool), false, String(tool));
});

test('removes only a leading RTK command wrapper', () => {
  assert.equal(withoutRtkPrefix('rtk git commit -m fix'), 'git commit -m fix');
  assert.equal(withoutRtkPrefix('RTK  git status'), 'git status');
  assert.equal(withoutRtkPrefix('rtk'), '');
  assert.equal(withoutRtkPrefix('rtkx status'), 'rtkx status');
  assert.equal(withoutRtkPrefix('git rtk status'), 'git rtk status');
});

test('splits chained commands outside quotes', () => {
  assert.deepEqual(
    splitChainedCommands('cd repo && git commit -m "a; b" | cat; ls || pwd & wait'),
    ['cd repo', 'git commit -m "a; b"', 'cat', 'ls', 'pwd', 'wait'],
  );
  assert.deepEqual(
    splitChainedCommands(`echo "it's; fine" ; echo 'a && b' && echo c\\;d\nls |& cat`),
    [`echo "it's; fine"`, `echo 'a && b'`, 'echo c\\;d', 'ls', 'cat'],
  );
  assert.deepEqual(splitChainedCommands(' ;; && '), []);
});

test('removes comments that start at an unquoted word boundary', () => {
  assert.equal(withoutComments('echo ok # && git commit -m fix'), 'echo ok ');
  assert.equal(withoutComments('# note\ngit commit'), '\ngit commit');
  assert.equal(withoutComments('ls;# x && rm y\npwd'), 'ls;\npwd');
  const literal = `echo "a # b" 'c # d' e\\#f g#h $# \${#x} a\\ #b`;
  assert.equal(withoutComments(literal), literal);
});
