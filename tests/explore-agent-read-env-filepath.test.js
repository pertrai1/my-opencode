const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const { SafetyPlugin } = require('../plugins/safety.ts');

test('Explore Agent - read hook denies sensitive env file paths via args.filePath but allows .env.example', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });

  await plugin['chat.message']({
    sessionID: 'session-explore-read-env-filepath',
    agent: 'explore',
  }, { message: {}, parts: [] });

  await assert.rejects(
    plugin['tool.execute.before']({
      tool: 'read',
      sessionID: 'session-explore-read-env-filepath',
      callID: 'read-dotenv',
    }, { args: { filePath: '.env' } }),
    /Permission denied: Reading sensitive env files is blocked/,
  );

  await assert.rejects(
    plugin['tool.execute.before']({
      tool: 'read',
      sessionID: 'session-explore-read-env-filepath',
      callID: 'read-dotenv-production',
    }, { args: { filePath: 'config/.env.production' } }),
    /Permission denied: Reading sensitive env files is blocked/,
  );

  await assert.doesNotReject(
    plugin['tool.execute.before']({
      tool: 'read',
      sessionID: 'session-explore-read-env-filepath',
      callID: 'read-dotenv-example',
    }, { args: { filePath: 'config/.env.example' } }),
  );
});
