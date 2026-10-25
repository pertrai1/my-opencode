const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { promisify } = require('node:util');
const { execFile: realExecFile } = require('node:child_process');
const { tmpdir } = require('node:os');
const ts = require('typescript');

// Exercise the registered hooks, replacing only the external CLI boundary.
async function createGraphPlugin(directory, failure, run = async () => ({ stdout: '' }), statusOutput = JSON.stringify({
  files: 1,
  built_at_commit: 'same',
  current_sha: 'same',
  built_on_branch: 'main',
  current_branch: 'main',
})) {
  const calls = [];
  const statusCalls = [];
  const logs = [];
  const execFile = () => {};
  execFile[promisify.custom] = async (file, args, options = {}) => {
    const call = { file, args: Array.from(args), cwd: options.cwd };
    if (args.at(0) === 'status') statusCalls.push(call);
    else calls.push(call);
    if (failure) throw failure;
    if (args.at(0) === 'status') return { stdout: statusOutput };
    return run(file, args, options);
  };
  const filename = path.join(__dirname, '../plugins/crg-plugin.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const pluginApi = await import('@opencode/plugin');
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    require: (id) => {
      if (id === 'node:child_process') return { execFile };
      if (id === '@opencode/plugin') return pluginApi;
      if (id.startsWith('.')) return require(path.resolve(path.dirname(filename), id));
      return require(id);
    },
    console: { log: (...args) => logs.push(args) },
  }, { filename });
  async function setup(contextDirectory) {
    const hooks = {};
    await exports.default.setup({
      location: { directory: contextDirectory },
      tool: { hook: async (name, handler) => { hooks[name] = handler; } },
    });
    return hooks;
  }
  return { calls, statusCalls, logs, hooks: await setup(directory), setup };
}

test('startup builds a missing graph', async () => {
  const { calls, statusCalls } = await createGraphPlugin(
    path.resolve('fixtures', 'missing repository'),
    undefined,
    undefined,
    JSON.stringify({ files: 0 }),
  );
  assert.equal(statusCalls.length, 1);
  assert.deepEqual(calls, [{
    file: 'code-review-graph', args: ['build'], cwd: path.resolve('fixtures', 'missing repository'),
  }]);
});

test('startup rebuilds a graph from another commit or branch', async () => {
  const directory = path.resolve('fixtures', 'stale repository');
  const { calls, statusCalls } = await createGraphPlugin(directory, undefined, undefined, JSON.stringify({
    files: 10,
    built_at_commit: 'old',
    current_sha: 'new',
    built_on_branch: 'main',
    current_branch: 'feature',
  }));
  assert.equal(statusCalls.length, 1);
  assert.deepEqual(calls, [{ file: 'code-review-graph', args: ['build'], cwd: directory }]);
});

test('startup does not rebuild a current graph', async () => {
  const { calls, statusCalls } = await createGraphPlugin(path.resolve('fixtures', 'current repository'));
  assert.equal(statusCalls.length, 1);
  assert.deepEqual(calls, []);
});

test('graph hooks inspect and update the session repository instead of the server cwd', async () => {
  const directory = path.resolve('fixtures', 'another repository');
  assert.notEqual(directory, process.cwd());
  const { hooks, calls } = await createGraphPlugin(directory);
  await hooks['execute.before']({ tool: 'bash', input: { command: 'git commit -m fix' } });
  await hooks['execute.after']({ tool: 'edit', status: 'completed' });
  assert.deepEqual(calls, [
    { file: 'code-review-graph', args: ['detect-changes', '--brief'], cwd: directory },
    { file: 'code-review-graph', args: ['update', '--skip-flows'], cwd: directory },
  ]);
});

test('separate plugin contexts keep their own graph directories', async () => {
  const firstDirectory = path.resolve('fixtures', 'first repository');
  const secondDirectory = path.resolve('fixtures', 'second repository');
  const { hooks: first, setup, calls } = await createGraphPlugin(firstDirectory);
  const second = await setup(secondDirectory);
  await Promise.all([
    first['execute.after']({ tool: 'write', status: 'completed' }),
    second['execute.after']({ tool: 'patch', status: 'completed' }),
  ]);
  assert.deepEqual(calls.map((call) => call.cwd), [firstDirectory, secondDirectory]);
});

test('graph CLI failures remain non-blocking in the session directory', async () => {
  const directory = path.resolve('fixtures', 'unavailable repository');
  const { hooks, calls } = await createGraphPlugin(directory, new Error('spawn ENOENT'));
  await assert.doesNotReject(() => hooks['execute.before']({
    tool: 'bash', input: { command: 'git commit -m fix' },
  }));
  await assert.doesNotReject(() => hooks['execute.after']({ tool: 'edit', status: 'completed' }));
  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.cwd === directory));
});

test('irrelevant commands and unsuccessful edits do not invoke the graph CLI', async () => {
  const { hooks, calls } = await createGraphPlugin(path.resolve('fixtures'));
  await hooks['execute.before']({ tool: 'bash', input: { command: 'git status' } });
  await hooks['execute.after']({ tool: 'edit', status: 'failed' });
  await hooks['execute.after']({ tool: 'read', status: 'completed' });
  assert.deepEqual(calls, []);
});

test('commits are detected in the session directory through RTK prefixes, chains, and comments', async () => {
  const directory = path.resolve('fixtures', 'session repository');
  for (const command of [
    'rtk git commit -m fix',
    'git add . && git commit -m fix',
    'git add . ; rtk git commit -m fix',
    'git commit -m "fix #1" # then cd elsewhere',
  ]) {
    const { hooks, calls } = await createGraphPlugin(directory);
    await hooks['execute.before']({ tool: 'shell', input: { command } });
    assert.deepEqual(calls, [{ file: 'code-review-graph', args: ['detect-changes', '--brief'], cwd: directory }], command);
  }
});

test('commit-like text outside a shell commit does not invoke the graph CLI', async () => {
  const { hooks, calls } = await createGraphPlugin(path.resolve('fixtures'));
  await hooks['execute.before']({ tool: 'write', input: { filePath: 'notes.md', content: 'git commit -m fix' } });
  for (const command of ['echo "git commit -m fix"', 'git commit-graph write', 'echo ok # && git commit -m fix']) {
    await hooks['execute.before']({ tool: 'shell', input: { command } });
  }
  assert.deepEqual(calls, []);
});

test('commits after a directory change are skipped because their repository is unknown', async () => {
  const { hooks, calls } = await createGraphPlugin(path.resolve('fixtures'));
  for (const command of [
    'cd repo && git commit -m fix',
    'rtk cd repo; git commit -m fix',
    '( cd repo && git commit -m fix )',
    'pushd repo && git commit -m fix',
  ]) {
    await hooks['execute.before']({ tool: 'shell', input: { command } });
  }
  assert.deepEqual(calls, []);
});

function graphProcess(t, script) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'graph repository ')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const executions = [];
  const run = async (file, args, options) => {
    // Keep the real timeout/kill mechanism; shorten only its duration for tests.
    const execution = promisify(realExecFile)(process.execPath, ['-e', script, ...args], {
      ...options,
      timeout: options.timeout === undefined ? undefined : Math.min(options.timeout, 1000),
    });
    const record = { child: execution.child, options };
    executions.push(record);
    t.after(() => {
      if (record.child.exitCode === null && record.child.signalCode === null) record.child.kill('SIGKILL');
    });
    try {
      return await execution;
    } catch (error) {
      record.error = error;
      throw error;
    }
  };
  return { directory, executions, run };
}

const graphHooks = [
  ['commit', 'execute.before', { tool: 'bash', input: { command: 'git commit -m fix' } }, ['detect-changes', '--brief']],
  ['edit', 'execute.after', { tool: 'edit', status: 'completed' }, ['update', '--skip-flows']],
];

for (const [name, hook, event, args] of graphHooks) {
  test(`${name} hook kills a hung graph child and returns without failing`, { timeout: 5000 }, async (t) => {
    const fixture = graphProcess(t, `
      process.on('SIGTERM', () => {});
      require('node:fs').writeFileSync('started.json', JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(1) }));
      setInterval(() => {}, 1000);
    `);
    const { hooks, logs } = await createGraphPlugin(fixture.directory, undefined, fixture.run);
    await assert.doesNotReject(() => hooks[hook](event));
    const [{ child, error, options }] = fixture.executions;
    assert.ok(options.timeout > 0 && options.timeout <= 10000, 'optional graph work has a finite latency budget');
    assert.equal(child.signalCode, 'SIGKILL');
    assert.equal(error.killed, true);
    assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.directory, 'started.json'), 'utf8')), {
      cwd: fixture.directory, args,
    });
    assert.deepEqual(logs, []);
  });

  test(`${name} hook preserves successful graph execution in the repository directory`, async (t) => {
    const fixture = graphProcess(t, `
      require('node:fs').writeFileSync('completed.json', JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(1) }));
      console.log('  graph analysis  ');
    `);
    const { hooks, logs } = await createGraphPlugin(fixture.directory, undefined, fixture.run);
    await hooks[hook](event);
    assert.equal(fixture.executions[0].child.exitCode, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(fixture.directory, 'completed.json'), 'utf8')), {
      cwd: fixture.directory, args,
    });
    assert.equal(logs.length, name === 'commit' ? 1 : 0);
    if (name === 'commit') {
      const [message, detail] = logs.at(0) ?? [];
      assert.equal(message, '[code-review-graph] pre-commit analysis');
      assert.equal(detail.output, 'graph analysis');
    }
  });

  test(`${name} hook remains fail-open on a nonzero graph exit`, async (t) => {
    const fixture = graphProcess(t, "console.log('partial analysis'); process.exitCode = 7;");
    const { hooks, logs } = await createGraphPlugin(fixture.directory, undefined, fixture.run);
    await assert.doesNotReject(() => hooks[hook](event));
    assert.equal(fixture.executions[0].child.exitCode, 7);
    assert.equal(fixture.executions[0].error.code, 7);
    assert.deepEqual(logs, []);
  });
}
