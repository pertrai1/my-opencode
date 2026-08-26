const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const { SafetyPlugin } = require('../plugins/safety.ts');

test('Explore Agent - command hook denies sensitive env-reader operands for shell readers but allows .env.example', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });
  const sessionID = 'session-explore-shell-env-readers';

  await plugin['chat.message']({
    sessionID,
    agent: 'explore',
  }, { message: {}, parts: [] });

  const deniedCommands = [
    'tail .env',
    'grep TOKEN config/.env.production',
    'rg TOKEN .env.local',
    'sed -n "1p" .env',
    'awk "NR==1" config/.env.production',
    'rtk tail .env',
    'rtk grep TOKEN config/.env.production',
    'rtk rg TOKEN .env.local',
    'rtk sed -n "1p" .env',
    'rtk awk "NR==1" config/.env.production',
  ];

  for (const command of deniedCommands) {
    await assert.rejects(
      plugin['tool.execute.before']({
        tool: 'bash',
        sessionID,
        callID: command,
      }, { args: { command } }),
      /Permission denied: Reading sensitive env files is blocked/,
      `Expected '${command}' to be denied`,
    );
  }

  const allowedCommands = [
    'tail config/.env.example',
    'grep TOKEN config/.env.example',
    'rg TOKEN config/.env.example',
    'sed -n "1p" config/.env.example',
    'awk "NR==1" config/.env.example',
    'rtk tail config/.env.example',
    'rtk grep TOKEN config/.env.example',
    'rtk rg TOKEN config/.env.example',
    'rtk sed -n "1p" config/.env.example',
    'rtk awk "NR==1" config/.env.example',
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
