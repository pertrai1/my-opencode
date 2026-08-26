const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const { SafetyPlugin } = require('../plugins/safety.ts');

test('Explore Agent - session.deleted stops applying explore-only runtime restrictions to that session', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });
  const sessionID = 'session-explore-deleted';

  await plugin['chat.message']({
    sessionID,
    agent: 'explore',
  }, { message: {}, parts: [] });

  await assert.rejects(
    plugin['tool.execute.before']({
      tool: 'edit',
      sessionID,
      callID: 'before-delete',
    }, { args: {} }),
    /Permission denied: Tool 'edit' is blocked/,
  );

  await plugin['event']({
    event: {
      id: 'event-session-deleted',
      type: 'session.deleted',
      properties: {
        sessionID,
        info: {},
      },
    },
  });

  await assert.doesNotReject(
    plugin['tool.execute.before']({
      tool: 'edit',
      sessionID,
      callID: 'after-delete',
    }, { args: {} }),
  );
});
