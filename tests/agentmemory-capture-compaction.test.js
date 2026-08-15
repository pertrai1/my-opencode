const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

require('./helpers/register-ts');

test('agentmemory capture wires deterministic anchor through live hooks and clears state on session deletion', async (t) => {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@opencode-ai/plugin') {
      return {
        tool(definition) {
          return definition;
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  t.after(() => {
    Module._load = originalLoad;
  });

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const { pathname } = new URL(String(url));
    if (pathname === '/session/start') {
      return { ok: true, json: async () => ({}) };
    }
    if (pathname === '/agentmemory/context') {
      return { ok: true, json: async () => ({ context: 'Remote narrative context' }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const recursiveNoop = new Proxy(async function noop() {}, {
    get() {
      return recursiveNoop;
    },
    apply: async () => undefined,
  });

  const { AgentmemoryCapture } = require('../plugins/agentmemory-capture.ts');
  const plugin = await AgentmemoryCapture({
    client: recursiveNoop,
    project: recursiveNoop,
    directory: process.cwd(),
    worktree: process.cwd(),
    experimental_workspace: { register() {} },
    serverUrl: new URL('https://example.test'),
    $: recursiveNoop,
  });

  await plugin.event({
    event: {
      type: 'session.created',
      properties: {
        info: {
          id: 'session-anchor-live',
          title: 'Live anchor test',
        },
      },
    },
  });

  await plugin['chat.message'](
    {
      sessionID: 'session-anchor-live',
      agent: 'test-agent',
      model: {
        providerID: 'openai',
        modelID: 'gpt-5.4',
      },
      messageID: 'user-message-1',
    },
    {
      message: {
        id: 'user-message-1',
        sessionID: 'session-anchor-live',
        role: 'user',
        time: { created: 1 },
        agent: 'test-agent',
        model: {
          providerID: 'openai',
          modelID: 'gpt-5.4',
        },
      },
      parts: [
        {
          id: 'user-text-1',
          sessionID: 'session-anchor-live',
          messageID: 'user-message-1',
          type: 'text',
          text: 'Investigate the failing test and explain what broke.',
        },
      ],
    },
  );

  await plugin.event({
    event: {
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'tool-part-complete-1',
          sessionID: 'session-anchor-live',
          messageID: 'assistant-message-1',
          type: 'tool',
          callID: 'tool-complete-1',
          tool: 'bash',
          state: {
            status: 'completed',
            input: { command: 'npm test' },
            output: '1 test failed',
            title: 'Run tests',
            time: { start: 10, end: 135 },
          },
        },
      },
    },
  });

  const compactionOutput = { context: [] };
  await plugin['experimental.session.compacting'](
    { sessionID: 'session-anchor-live' },
    compactionOutput,
  );

  assert.match(compactionOutput.context[0], /Investigate the failing test and explain what broke\./);
  assert.match(compactionOutput.context[0], /withheld output/i);
  assert.doesNotMatch(compactionOutput.context[0], /1 test failed/);
  assert.strictEqual(compactionOutput.context[1], 'Remote narrative context');

  await plugin.event({
    event: {
      type: 'session.deleted',
      properties: {
        info: {
          id: 'session-anchor-live',
        },
      },
    },
  });

  const clearedOutput = { context: [] };
  await plugin['experimental.session.compacting'](
    { sessionID: 'session-anchor-live' },
    clearedOutput,
  );

  assert.deepStrictEqual(clearedOutput.context, ['Remote narrative context']);
});
