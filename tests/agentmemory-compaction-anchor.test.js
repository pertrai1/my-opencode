const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

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
  const replayStore = createSessionCompactionAnchorStore({
    maxUserRequests: 1,
    maxToolCompletions: 1,
    maxToolFailures: 1,
    maxPatchEntries: 1,
    maxSessionDiffEntries: 1,
    maxSessionErrors: 1,
  });
  const sessionId = 'session-anchor-red';

  assert.ok(DEFAULT_SESSION_COMPACTION_ANCHOR_LIMITS.maxUserRequests >= 1);

  const replayEvidenceSequence = (targetStore) => {
    captureSessionCompactionAnchorChatMessage(
      targetStore,
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
      targetStore,
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

    captureSessionCompactionAnchorChatMessage(
      targetStore,
      {
        sessionID: sessionId,
        agent: 'test-agent',
        model: {
          providerID: 'openai',
          modelID: 'gpt-5.4',
        },
        messageID: 'user-message-2',
      },
      {
        message: {
          id: 'user-message-2',
          sessionID: sessionId,
          role: 'user',
          time: { created: 3 },
          agent: 'test-agent',
          model: {
            providerID: 'openai',
            modelID: 'gpt-5.4',
          },
        },
        parts: [
          {
            id: 'user-text-2',
            sessionID: sessionId,
            messageID: 'user-message-2',
            type: 'text',
            text: 'Re-run the focused tests and summarize the remaining failures.',
          },
        ],
      },
    );

    captureSessionCompactionAnchorEvent(targetStore, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'tool-part-complete-0',
          sessionID: sessionId,
          messageID: 'assistant-message-0',
          type: 'tool',
          callID: 'tool-complete-0',
          tool: 'bash',
          state: {
            status: 'completed',
            input: { command: 'npm test -- --watch' },
            output: 'watch mode started',
            title: 'Start watch mode',
            metadata: {},
            time: { start: 4, end: 8 },
          },
        },
      },
    });

    captureSessionCompactionAnchorEvent(targetStore, {
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

    captureSessionCompactionAnchorEvent(targetStore, {
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

    captureSessionCompactionAnchorEvent(targetStore, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'tool-part-failure-0',
          sessionID: sessionId,
          messageID: 'assistant-message-1',
          type: 'tool',
          callID: 'tool-failure-0',
          tool: 'agentmemory',
          state: {
            status: 'error',
            input: { command: '/search' },
            error: 'older failure',
            time: { start: 150, end: 151 },
          },
        },
      },
    });

    captureSessionCompactionAnchorEvent(targetStore, {
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

    captureSessionCompactionAnchorEvent(targetStore, {
      type: 'message.part.updated',
      properties: {
        part: {
          id: 'patch-part-0',
          sessionID: sessionId,
          messageID: 'assistant-message-1',
          type: 'patch',
          hash: 'old-hash',
          files: ['obsolete.ts'],
        },
      },
    });

    captureSessionCompactionAnchorEvent(targetStore, {
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

    captureSessionCompactionAnchorEvent(targetStore, {
      type: 'session.diff',
      properties: {
        sessionID: sessionId,
        diff: [
          {
            file: 'obsolete.ts',
            before: '',
            after: '',
            additions: 1,
            deletions: 0,
          },
        ],
      },
    });

    captureSessionCompactionAnchorEvent(targetStore, {
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

    captureSessionCompactionAnchorEvent(targetStore, {
      type: 'session.error',
      properties: {
        sessionID: sessionId,
        error: {
          name: 'UnknownError',
          data: {
            message: 'First error',
          },
        },
      },
    });

    captureSessionCompactionAnchorEvent(targetStore, {
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

    captureSessionCompactionAnchorEvent(targetStore, {
      type: 'file.edited',
      properties: {
        file: 'ambiguous.txt',
      },
    });
  };

  replayEvidenceSequence(store);
  replayEvidenceSequence(replayStore);

  const evidence = store.getEvidence(sessionId);
  assert.strictEqual(evidence.length, 6);

  const userIntent = evidence.find((item) => item.kind === 'user-intent');
  assert.ok(userIntent);
  assert.match(userIntent.text, /Re-run the focused tests/);
  assert.doesNotMatch(userIntent.text, /Synthetic follow-up/);
  assert.doesNotMatch(userIntent.text, /Investigate the failing test/);

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
  const replayRendered = renderSessionCompactionAnchor(replayStore, sessionId);
  assert.ok(rendered, 'Expected deterministic session evidence to render');
  assert.strictEqual(rendered, replayRendered);
  assert.match(rendered, /Re-run the focused tests and summarize the remaining failures\./);
  assert.match(rendered, /Run tests/);
  assert.match(rendered, /withheld output/i);
  assert.match(rendered, /abc123/);
  assert.match(rendered, /plugins\/agentmemory-capture\.ts/);
  assert.match(rendered, /7/);
  assert.match(rendered, /2/);
  assert.match(rendered, /session error observed/i);
  assert.doesNotMatch(rendered, /Start watch mode/);
  assert.doesNotMatch(rendered, /old-hash/);
  assert.doesNotMatch(rendered, /obsolete\.ts/);
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
  assert.ok(output.context.some((entry) => /Re-run the focused tests and summarize the remaining failures\./.test(entry)));
  assert.ok(output.context.some((entry) => /withheld output/i.test(entry)));
  assert.ok(output.context.some((entry) => /session error observed/i.test(entry)));

  clearSessionCompactionAnchorSession(store, sessionId);
  assert.deepStrictEqual(store.getEvidence(sessionId), []);
  assert.strictEqual(renderSessionCompactionAnchor(store, sessionId), null);
});
