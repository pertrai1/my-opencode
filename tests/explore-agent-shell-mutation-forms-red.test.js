const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const { SafetyPlugin } = require('../plugins/safety.ts');

test('Explore Agent - shell hook rejects mutation-capable allowed forms while preserving read-only exploration commands', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });
  const sessionID = 'session-explore-shell-mutation-forms-red';

  await plugin['chat.message']({
    sessionID,
    agent: 'explore',
  }, { message: {}, parts: [] });

  const blockedCommands = [
    'find . -delete',
    'find . -exec rm {} \\;',
    'rg --pre "cat" TODO .',
    'git diff --output=/tmp/explore.patch',
    'git branch feature/explore-test',
    'git branch -d feature/explore-test',
    "sed -n '1e touch /tmp/explore-test' README.md",
    "awk 'BEGIN { system(\"touch /tmp/explore-test\") }' README.md",
  ];

  for (const command of blockedCommands) {
    await assert.rejects(
      plugin['tool.execute.before']({
        tool: 'bash',
        sessionID,
        callID: command,
      }, { args: { command } }),
      /Permission denied:/,
      `Expected '${command}' to be blocked`,
    );
  }

  const allowedCommands = [
    'find . -name "*.ts"',
    'rg TODO .',
    'git diff --stat',
    "sed -n '1p' README.md",
    "awk 'NR==1 { print }' README.md",
  ];

  for (const command of allowedCommands) {
    await assert.doesNotReject(
      plugin['tool.execute.before']({
        tool: 'bash',
        sessionID,
        callID: command,
      }, { args: { command } }),
      `Expected '${command}' to remain allowed`,
    );
  }
});
