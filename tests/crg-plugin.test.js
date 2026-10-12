const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { promisify } = require('node:util');
const ts = require('typescript');

// Exercise the registered hooks, replacing only the external CLI boundary.
async function createGraphPlugin(directory, failure) {
  const calls = [];
  const execFile = () => {};
  execFile[promisify.custom] = async (file, args, options = {}) => {
    calls.push({ file, args: Array.from(args), cwd: options.cwd });
    if (failure) throw failure;
    return { stdout: '' };
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
      return require(id);
    },
    console,
  }, { filename });
  async function setup(contextDirectory) {
    const hooks = {};
    await exports.default.setup({
      location: { directory: contextDirectory },
      tool: { hook: async (name, handler) => { hooks[name] = handler; } },
    });
    return hooks;
  }
  return { calls, hooks: await setup(directory), setup };
}

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
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.cwd === directory));
});

test('irrelevant commands and unsuccessful edits do not invoke the graph CLI', async () => {
  const { hooks, calls } = await createGraphPlugin(path.resolve('fixtures'));
  await hooks['execute.before']({ tool: 'bash', input: { command: 'git status' } });
  await hooks['execute.after']({ tool: 'edit', status: 'failed' });
  await hooks['execute.after']({ tool: 'read', status: 'completed' });
  assert.deepEqual(calls, []);
});
