const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const { SafetyPlugin } = require('../plugins/safety.ts');

test('Explore Agent - command hook denies sensitive .env shell reads but allows .env.example', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });

  await plugin['chat.message']({
    sessionID: 'session-explore-shell-env-command',
    agent: 'explore',
  }, { message: {}, parts: [] });

  await assert.rejects(
    plugin['tool.execute.before']({
      tool: 'bash',
      sessionID: 'session-explore-shell-env-command',
      callID: 'bash-cat-dotenv',
    }, { args: { command: 'cat .env' } }),
    /Permission denied: Reading sensitive env files is blocked/,
  );

  await assert.rejects(
    plugin['tool.execute.before']({
      tool: 'shell',
      sessionID: 'session-explore-shell-env-command',
      callID: 'shell-head-dotenv-production',
    }, { args: { command: 'head config/.env.production' } }),
    /Permission denied: Reading sensitive env files is blocked/,
  );

  await assert.rejects(
    plugin['tool.execute.before']({
      tool: 'bash',
      sessionID: 'session-explore-shell-env-command',
      callID: 'bash-rtk-cat-dotenv',
    }, { args: { command: 'rtk cat .env' } }),
    /Permission denied: Reading sensitive env files is blocked/,
  );

  await assert.rejects(
    plugin['tool.execute.before']({
      tool: 'shell',
      sessionID: 'session-explore-shell-env-command',
      callID: 'shell-rtk-head-dotenv-production',
    }, { args: { command: 'rtk head config/.env.production' } }),
    /Permission denied: Reading sensitive env files is blocked/,
  );

  await assert.doesNotReject(
    plugin['tool.execute.before']({
      tool: 'bash',
      sessionID: 'session-explore-shell-env-command',
      callID: 'bash-cat-dotenv-example',
    }, { args: { command: 'cat config/.env.example' } }),
  );
});
