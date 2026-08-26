const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const { SafetyPlugin } = require('../plugins/safety.ts');

test('Explore Agent - shell hook rejects RTK-wrapped destructive commands and shell-eval bypasses', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });

  await plugin['chat.message']({
    sessionID: 'session-explore-shell-enforcement-red',
    agent: 'explore',
  }, { message: {}, parts: [] });

  const blockedCommands = [
    'rtk git checkout branch',
    'rtk git restore file',
    'rtk git merge main',
    'rtk git reset --hard HEAD',
    'rtk git stash push',
    'rtk npm install package',
    'pwd\nrm -rf tmp',
    'printf safe $(rm -rf tmp)',
    'printf safe `rm -rf tmp`',
  ];

  for (const command of blockedCommands) {
    await assert.rejects(
      plugin['tool.execute.before']({
        tool: 'bash',
        sessionID: 'session-explore-shell-enforcement-red',
        callID: command,
      }, { args: { command } }),
      /Permission denied: .*blocked/,
      `Expected '${command}' to be blocked`,
    );
  }

  await assert.doesNotReject(
    plugin['tool.execute.before']({
      tool: 'bash',
      sessionID: 'session-explore-shell-enforcement-red',
      callID: 'quoted-single-quotes',
    }, { args: { command: "printf '%s' '$(git status) `git status`'" } }),
  );
});
