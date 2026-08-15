const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const Module = require('node:module');

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

test('agentmemory capture exposes an export-session-summary chat tool with empty args and fail-closed session-local output', async (t) => {
  const helperPathSuffix = `${require('node:path').sep}agentmemory-session-summary-export.ts`;
  const helperCalls = [];
  const pluginApiModule = {
    tool(definition) {
      return definition;
    },
  };
  const helperModule = {
    CURRENT_SESSION_SUMMARY_EXPORT_TOOL_NAME: 'export-session-summary',
    createCurrentSessionSummaryExportToolDefinition(request) {
      return {
        async execute() {
          const session = await request.currentSessionProvider.getCurrentSession();
          helperCalls.push(session.sessionId);
          return {
            title: 'Current Session Summary',
            output: [
              '## Deterministic Evidence',
              'No trusted session-local deterministic evidence is available for this session.',
              '',
              '## Optional Narrative (labeled, not ground truth)',
              'None available.',
            ].join('\n'),
            metadata: {
              destination: 'chat',
              wroteFiles: false,
              sessionId: session.sessionId,
            },
          };
        },
      };
    },
    buildCurrentSessionSummaryExportReport: async () => {
      throw new Error('Unexpected direct report builder call in plugin tool test');
    },
  };

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@opencode-ai/plugin') {
      return pluginApiModule;
    }

    if (
      request === './agentmemory-session-summary-export' ||
      request === './agentmemory-session-summary-export.ts' ||
      request.endsWith(helperPathSuffix)
    ) {
      return helperModule;
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  t.after(() => {
    Module._load = originalLoad;
  });

  const writeGuards = new Map([
    ['writeFileSync', fs.writeFileSync],
    ['appendFileSync', fs.appendFileSync],
    ['mkdirSync', fs.mkdirSync],
    ['rmSync', fs.rmSync],
    ['createWriteStream', fs.createWriteStream],
  ]);

  for (const [name] of writeGuards) {
    fs[name] = () => {
      throw new Error(`Unexpected filesystem write via fs.${name}`);
    };
  }

  t.after(() => {
    for (const [name, original] of writeGuards) {
      fs[name] = original;
    }
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

  assert.ok(plugin.tool, 'Expected plugin to expose tool definitions');
  assert.ok(plugin.tool['export-session-summary'], 'Expected export-session-summary tool to be registered');
  assert.deepStrictEqual(plugin.tool['export-session-summary'].args, {});

  const result = await plugin.tool['export-session-summary'].execute(
    {},
    {
      sessionID: 'session-from-context',
      messageID: 'message-1',
      agent: 'test-agent',
      directory: process.cwd(),
      worktree: process.cwd(),
      abort: new AbortController().signal,
      metadata() {},
      ask: async () => {
        throw new Error('Unexpected permission prompt');
      },
    },
  );

  assert.deepStrictEqual(helperCalls, ['session-from-context']);
  assert.strictEqual(result.title, 'Current Session Summary');
  assert.strictEqual(result.metadata.destination, 'chat');
  assert.strictEqual(result.metadata.wroteFiles, false);
  assert.strictEqual(result.metadata.sessionId, 'session-from-context');
  assert.match(result.output, /## Deterministic Evidence/);
  assert.match(result.output, /## Optional Narrative/);
  assert.match(result.output, /No trusted session-local deterministic evidence is available for this session\./);
  assert.doesNotMatch(result.output, /tool:\s|reproduced failing test|Investigate summary export/);
});
