const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const { SafetyPlugin } = require('../plugins/safety.ts');

test('Explore Agent - evicts the oldest tracked explore session after the tracked-session limit is exceeded', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });
  const oldestSessionID = 'session-explore-oldest';
  const newestSessionID = 'session-explore-newest';

  await plugin['chat.message']({
    sessionID: oldestSessionID,
    agent: 'explore',
  }, { message: {}, parts: [] });

  for (let index = 0; index < 1000; index++) {
    await plugin['chat.message']({
      sessionID: `session-explore-${index}`,
      agent: 'explore',
    }, { message: {}, parts: [] });
  }

  await plugin['chat.message']({
    sessionID: newestSessionID,
    agent: 'explore',
  }, { message: {}, parts: [] });

  await assert.doesNotReject(
    plugin['tool.execute.before']({
      tool: 'bash',
      sessionID: oldestSessionID,
      callID: 'oldest-evicted',
    }, { args: { command: 'mkdir folder' } }),
  );

  await assert.rejects(
    plugin['tool.execute.before']({
      tool: 'bash',
      sessionID: newestSessionID,
      callID: 'newest-still-active',
    }, { args: { command: 'mkdir folder' } }),
    /Permission denied: Command .* is blocked/,
  );
});
