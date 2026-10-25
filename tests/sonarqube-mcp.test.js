const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { tmpdir } = require('node:os');
const ts = require('typescript');

function configuredServer() {
  const filename = path.join(__dirname, '../opencode.jsonc');
  const { config, error } = ts.parseConfigFileTextToJson(filename, fs.readFileSync(filename, 'utf8'));
  assert.equal(error, undefined);
  return structuredClone(config.mcp.servers.sonarqube);
}

// Exercise the registered transform, replacing only the DNS boundary.
async function runPlugin(properties, { lookup = async () => ({ address: '10.1.2.3' }), server = configuredServer() } = {}) {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'sonarqube-mcp-'));
  if (properties !== undefined) fs.writeFileSync(path.join(directory, 'sonar-project.properties'), properties);
  const lookups = [];
  const filename = path.join(__dirname, '../plugins/sonarqube-mcp.ts');
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const pluginApi = await import('@opencode/plugin');
  const exports = {};
  vm.runInNewContext(compiled.outputText, {
    exports,
    URL,
    require: (id) => {
      if (id === 'node:dns/promises') return { lookup: async (hostname) => { lookups.push(hostname); return lookup(hostname); } };
      if (id === '@opencode/plugin') return pluginApi;
      return require(id);
    },
    console: { warn: () => {} },
  }, { filename });
  try {
    await exports.default.setup({
      location: { directory },
      mcp: {
        transform: async (apply) => apply({
          update: (name, update) => {
            assert.equal(name, 'sonarqube');
            update(server);
          },
        }),
      },
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  // Clone out of the sandbox realm so strict deep equality compares plain values.
  return { server: structuredClone(server), lookups };
}

function hostAliases(command) {
  return command.flatMap((part, index) => (part === '--add-host' ? [command[index + 1]] : []));
}

test('a resolved SonarQube host is aliased into the container before the image', async () => {
  const { server, lookups } = await runPlugin('sonar.host.url=https://sonar.internal.example:9000\nsonar.projectKey=demo\n');
  assert.deepEqual(lookups, ['sonar.internal.example']);
  assert.equal(server.disabled, false);
  assert.deepEqual(server.environment, { SONARQUBE_URL: 'https://sonar.internal.example:9000', SONARQUBE_PROJECT_KEY: 'demo' });
  const imageIndex = server.command.findIndex((part) => part.startsWith('sonarsource/sonarqube-mcp'));
  assert.deepEqual(server.command.slice(imageIndex - 2, imageIndex), ['--add-host', 'sonar.internal.example:10.1.2.3']);
});

test('a stale alias is replaced rather than duplicated', async () => {
  const server = configuredServer();
  server.command.splice(2, 0, '--add-host', 'sonar.internal.example:10.9.9.9');
  const result = await runPlugin('sonar.host.url=https://sonar.internal.example\n', { server });
  assert.deepEqual(hostAliases(result.server.command), ['sonar.internal.example:10.1.2.3']);
});

test('IP-literal hosts and failed lookups start without an alias', async () => {
  const literal = await runPlugin('sonar.host.url=http://10.0.0.5:9000\n');
  assert.deepEqual(literal.lookups, []);
  assert.deepEqual(hostAliases(literal.server.command), []);

  const failed = await runPlugin('sonar.host.url=https://sonar.internal.example\n', {
    lookup: async () => { throw new Error('ENOTFOUND'); },
  });
  assert.equal(failed.server.disabled, false);
  assert.deepEqual(hostAliases(failed.server.command), []);
});

test('repositories without a SonarQube host keep the server disabled', async () => {
  for (const properties of [undefined, 'sonar.projectKey=demo\n']) {
    const { server, lookups } = await runPlugin(properties);
    assert.equal(server.disabled, true);
    assert.deepEqual(lookups, []);
    assert.equal(server.environment.SONARQUBE_URL, undefined);
  }
});
