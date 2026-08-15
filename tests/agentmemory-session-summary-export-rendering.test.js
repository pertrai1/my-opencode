const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

test('session summary export renders real report content and unavailable narrative states', async () => {
  const {
    CURRENT_SESSION_SUMMARY_EXPORT_TOOL_NAME,
    createCurrentSessionSummaryExportToolDefinition,
    buildCurrentSessionSummaryExportReport,
    buildSessionSummaryExportMarkdown,
  } = require('../plugins/agentmemory-session-summary-export.ts');

  assert.strictEqual(CURRENT_SESSION_SUMMARY_EXPORT_TOOL_NAME, 'export-session-summary');

  const request = {
    currentSessionProvider: {
      async getCurrentSession() {
        return {
          sessionId: 'session-summary-real',
          title: 'Investigate summary export',
        };
      },
    },
    deterministicAnchorProvider: {
      async getDeterministicAnchorForSession(sessionId) {
        return {
          sessionId,
          source: 'deterministic-session-anchor',
          markdown: 'Session Compaction Anchor (deterministic, evidence-only)\n- [user intent] investigate export',
          unresolvedFailuresMarkdown: '- [observed failures] bash (tool-1) failure=[withheld error to avoid leaking sensitive tool content] durationMs=12',
        };
      },
    },
    narrativeContextProvider: {
      async getNarrativeSummaryForSession(sessionId) {
        return {
          sessionId,
          source: 'agentmemory-narrative-summary',
          markdown: 'The agent narrowed the issue to the export tool path.',
        };
      },
    },
  };

  const report = await buildCurrentSessionSummaryExportReport(request);
  assert.deepStrictEqual(report.narrativeSummaryUnavailable ?? null, null);

  const markdown = buildSessionSummaryExportMarkdown(report);
  assert.match(markdown, /## Session Summary Export/);
  assert.match(markdown, /## Deterministic Session Anchor/);
  assert.match(markdown, /Session Compaction Anchor/);
  assert.match(markdown, /## Unresolved Failures/);
  assert.match(markdown, /withheld error/i);
  assert.match(markdown, /## Summary Material/);
  assert.match(markdown, /not ground truth/i);
  assert.match(markdown, /narrowed the issue to the export tool path/i);
  assert.match(markdown, /not an independently verified build\/test result/i);
  assert.match(markdown, /Session Title: Investigate summary export\n\n## Deterministic Session Anchor/);
  assert.match(markdown, /## Summary Material\nAgentMemory narrative summary \(not ground truth\):\nThe agent narrowed the issue to the export tool path\./);

  const toolResult = await createCurrentSessionSummaryExportToolDefinition(request).execute({}, { sessionID: 'ignored' });
  assert.strictEqual(toolResult.metadata.sessionId, 'session-summary-real');
  assert.strictEqual(toolResult.metadata.destination, 'chat');
  assert.strictEqual(toolResult.metadata.wroteFiles, false);

  const unavailableReport = await buildCurrentSessionSummaryExportReport({
    currentSessionProvider: request.currentSessionProvider,
    deterministicAnchorProvider: {
      async getDeterministicAnchorForSession(sessionId) {
        return {
          sessionId,
          source: 'deterministic-session-anchor',
          markdown: '',
          unresolvedFailuresMarkdown: null,
        };
      },
    },
    narrativeContextProvider: {
      async getNarrativeSummaryForSession(sessionId) {
        return {
          sessionId,
          source: 'agentmemory-narrative-summary-unavailable',
          reason: 'http-error',
        };
      },
    },
    verificationEvidenceProvider: {
      async getVerificationEvidenceForSession() {
        return {
          source: 'explicit-verification-evidence',
          markdown: '- npm test was run explicitly.',
        };
      },
    },
  });

  const unavailableMarkdown = buildSessionSummaryExportMarkdown(unavailableReport);
  assert.match(unavailableMarkdown, /No trusted session-local deterministic evidence is available for this session\./);
  assert.match(unavailableMarkdown, /AgentMemory narrative summary was unavailable because the service returned an error\./);
  assert.match(unavailableMarkdown, /## Explicit Verification Evidence/);
  assert.match(unavailableMarkdown, /No trusted session-local deterministic evidence is available for this session\.\n\n## Summary Material/);
  assert.doesNotMatch(unavailableMarkdown, /## Deterministic Session Anchor/);
  assert.doesNotMatch(unavailableMarkdown, /not an independently verified build\/test result/i);
});
