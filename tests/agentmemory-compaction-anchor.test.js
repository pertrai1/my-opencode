const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const originalTsExtension = require.extensions && require.extensions['.ts'];
if (require.extensions && !originalTsExtension) {
  require.extensions['.ts'] = function registerTypeScript(module, filename) {
    const ts = require('typescript');
    const source = fs.readFileSync(filename, 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    });
    module._compile(result.outputText, filename);
  };
}

test.after(() => {
  if (!require.extensions) {
    return;
  }

  if (originalTsExtension) {
    require.extensions['.ts'] = originalTsExtension;
    return;
  }

  delete require.extensions['.ts'];
});

test('session compaction anchor retains bounded source-labeled evidence and injects it without inferring success', () => {
  const {
    createSessionCompactionAnchorStore,
    captureSessionCompactionAnchorChatMessage,
    captureSessionCompactionAnchorEvent,
    clearSessionCompactionAnchorSession,
    injectSessionCompactionAnchor,
    renderSessionCompactionAnchor,
    DEFAULT_SESSION_COMPACTION_ANCHOR_LIMITS,
  } = require('../plugins/agentmemory-compaction-anchor.ts');

  const store = createSessionCompactionAnchorStore({
    maxUserRequests: 1,
    maxToolCompletions: 1,
    maxToolFailures: 1,
    maxPatchEntries: 1,
    maxSessionDiffEntries: 1,
    maxSessionErrors: 1,
  });
  const sessionId = 'session-anchor-red';

  assert.ok(DEFAULT_SESSION_COMPACTION_ANCHOR_LIMITS.maxUserRequests >= 1);

  captureSessionCompactionAnchorChatMessage(
    store,
    {
      sessionID: sessionId,
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
        sessionID: sessionId,
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
          sessionID: sessionId,
          messageID: 'user-message-1',
          type: 'text',
          text: 'Investigate the failing test and explain what broke.',
        },
      ],
    },
  );

  captureSessionCompactionAnchorChatMessage(
    store,
    {
      sessionID: sessionId,
      agent: 'test-agent',
      model: {
        providerID: 'openai',
        modelID: 'gpt-5.4',
      },
      messageID: 'user-message-synthetic',
    },
    {
      message: {
        id: 'user-message-synthetic',
        sessionID: sessionId,
        role: 'user',
        time: { created: 2 },
        agent: 'test-agent',
        model: {
          providerID: 'openai',
          modelID: 'gpt-5.4',
        },
      },
      parts: [
        {
          id: 'user-text-synthetic',
          sessionID: sessionId,
          messageID: 'user-message-synthetic',
          type: 'text',
          text: 'Synthetic follow-up',
          synthetic: true,
        },
      ],
    },
  );

  captureSessionCompactionAnchorEvent(store, {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'tool-part-complete-1',
        sessionID: sessionId,
        messageID: 'assistant-message-1',
        type: 'tool',
        callID: 'tool-complete-1',
        tool: 'bash',
        state: {
          status: 'completed',
          input: { command: 'npm test' },
          output: '1 test failed',
          title: 'Run tests',
          metadata: {},
          time: { start: 10, end: 135 },
        },
      },
    },
  });

  captureSessionCompactionAnchorEvent(store, {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'reasoning-part-1',
        sessionID: sessionId,
        messageID: 'assistant-message-1',
        type: 'reasoning',
        text: 'This should not be trusted evidence.',
        time: { start: 220, end: 221 },
      },
    },
  });

  captureSessionCompactionAnchorEvent(store, {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'tool-part-failure-1',
        sessionID: sessionId,
        messageID: 'assistant-message-1',
        type: 'tool',
        callID: 'tool-failure-1',
        tool: 'agentmemory',
        state: {
          status: 'error',
          input: { command: '/context' },
          error: 'remote context retrieval failed',
          time: { start: 200, end: 212 },
        },
      },
    },
  });

  captureSessionCompactionAnchorEvent(store, {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'patch-part-1',
        sessionID: sessionId,
        messageID: 'assistant-message-1',
        type: 'patch',
        hash: 'abc123',
        files: ['plugins/agentmemory-capture.ts'],
      },
    },
  });

  captureSessionCompactionAnchorEvent(store, {
    type: 'session.diff',
    properties: {
      sessionID: sessionId,
      diff: [
        {
          file: 'plugins/agentmemory-capture.ts',
          before: '',
          after: '',
          additions: 7,
          deletions: 2,
        },
      ],
    },
  });

  captureSessionCompactionAnchorEvent(store, {
    type: 'session.error',
    properties: {
      sessionID: sessionId,
      error: {
        name: 'UnknownError',
        data: {
          message: 'AgentMemory context retrieval failed',
        },
      },
    },
  });

  captureSessionCompactionAnchorEvent(store, {
    type: 'file.edited',
    properties: {
      file: 'ambiguous.txt',
    },
  });

  const evidence = store.getEvidence(sessionId);
  assert.strictEqual(evidence.length, 6);

  const userIntent = evidence.find((item) => item.kind === 'user-intent');
  assert.ok(userIntent);
  assert.match(userIntent.text, /Investigate the failing test/);
  assert.doesNotMatch(userIntent.text, /Synthetic follow-up/);

  const toolCompletion = evidence.find((item) => item.kind === 'tool-completion');
  assert.ok(toolCompletion);
  assert.strictEqual(toolCompletion.toolName, 'bash');
  assert.strictEqual(toolCompletion.callId, 'tool-complete-1');
  assert.strictEqual(toolCompletion.title, 'Run tests');
  assert.match(toolCompletion.inputExcerpt, /withheld input/i);
  assert.match(toolCompletion.outputExcerpt, /withheld output/i);
  assert.strictEqual(toolCompletion.durationMs, 125);

  const toolFailure = evidence.find((item) => item.kind === 'tool-failure');
  assert.ok(toolFailure);
  assert.strictEqual(toolFailure.toolName, 'agentmemory');
  assert.strictEqual(toolFailure.callId, 'tool-failure-1');
  assert.match(toolFailure.inputExcerpt, /withheld input/i);
  assert.match(toolFailure.errorExcerpt, /withheld error/i);
  assert.strictEqual(toolFailure.durationMs, 12);

  const patchMetadata = evidence.find((item) => item.kind === 'patch-metadata');
  assert.ok(patchMetadata);
  assert.strictEqual(patchMetadata.hash, 'abc123');
  assert.deepStrictEqual(patchMetadata.files, ['plugins/agentmemory-capture.ts']);

  const sessionDiff = evidence.find((item) => item.kind === 'session-diff');
  assert.ok(sessionDiff);
  assert.deepStrictEqual(sessionDiff.files, ['plugins/agentmemory-capture.ts']);
  assert.strictEqual(sessionDiff.additions, 7);
  assert.strictEqual(sessionDiff.deletions, 2);

  const sessionError = evidence.find((item) => item.kind === 'session-error');
  assert.ok(sessionError);
  assert.match(sessionError.errorExcerpt, /session error observed/i);

  const rendered = renderSessionCompactionAnchor(store, sessionId);
  assert.ok(rendered, 'Expected deterministic session evidence to render');
  assert.match(rendered, /Investigate the failing test and explain what broke\./);
  assert.match(rendered, /Run tests/);
  assert.match(rendered, /withheld output/i);
  assert.match(rendered, /abc123/);
  assert.match(rendered, /plugins\/agentmemory-capture\.ts/);
  assert.match(rendered, /7/);
  assert.match(rendered, /2/);
  assert.match(rendered, /session error observed/i);
  assert.doesNotMatch(rendered, /This should not be trusted evidence\./);
  assert.doesNotMatch(rendered, /ambiguous\.txt/);
  assert.doesNotMatch(rendered, /npm test/);
  assert.doesNotMatch(rendered, /1 test failed/);
  assert.doesNotMatch(rendered, /remote context retrieval failed/i);
  assert.doesNotMatch(rendered, /(?:^|\b)(?:build|test) success(?:\b|$)|(?:^|\b)SUCCESS(?:\b|$)/i);

  const output = {
    context: ['AgentMemory /context failed before local anchor injection.'],
  };

  assert.strictEqual(injectSessionCompactionAnchor(store, sessionId, output), true);
  assert.ok(Array.isArray(output.context));
  assert.ok(output.context.some((entry) => /AgentMemory \/context failed before local anchor injection\./.test(entry)));
  assert.ok(output.context.some((entry) => /Investigate the failing test and explain what broke\./.test(entry)));
  assert.ok(output.context.some((entry) => /withheld output/i.test(entry)));
  assert.ok(output.context.some((entry) => /session error observed/i.test(entry)));

  clearSessionCompactionAnchorSession(store, sessionId);
  assert.deepStrictEqual(store.getEvidence(sessionId), []);
  assert.strictEqual(renderSessionCompactionAnchor(store, sessionId), null);
});
