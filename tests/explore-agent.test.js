const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

// Dynamic TypeScript compilation hook
if (require.extensions && !require.extensions['.ts']) {
  require.extensions['.ts'] = function (module, filename) {
    const ts = require('typescript');
    const source = fs.readFileSync(filename, 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      }
    });
    module._compile(result.outputText, filename);
  };
}

const { SafetyPlugin } = require('../plugins/safety.ts');

test('Explore Agent - Write/Delegation Denied', async (t) => {
  const plugin = await SafetyPlugin({ directory: __dirname });

  // Simulate starting explore agent session
  await plugin["chat.message"]({
    sessionID: 'session-explore-test',
    agent: 'explore'
  }, { message: {}, parts: [] });

  await t.test('denies edit and task tool execution', async () => {
    // Check permission.ask
    const permissionOutput = { status: 'ask' };
    await plugin["permission.ask"]({
      id: 'p1',
      type: 'edit',
      sessionID: 'session-explore-test',
      messageID: 'm1',
      title: 'Request edit permission',
      metadata: {},
      time: { created: Date.now() }
    }, permissionOutput);

    assert.strictEqual(permissionOutput.status, 'deny');

    const permissionOutput2 = { status: 'ask' };
    await plugin["permission.ask"]({
      id: 'p2',
      type: 'task',
      sessionID: 'session-explore-test',
      messageID: 'm1',
      title: 'Request task permission',
      metadata: {},
      time: { created: Date.now() }
    }, permissionOutput2);

    assert.strictEqual(permissionOutput2.status, 'deny');

    // Check tool.execute.before
    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'edit',
        sessionID: 'session-explore-test',
        callID: 'call1'
      }, { args: {} });
    }, /Permission denied: Tool 'edit' is blocked/);

    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'task',
        sessionID: 'session-explore-test',
        callID: 'call2'
      }, { args: {} });
    }, /Permission denied: Tool 'task' is blocked/);
  });

  await t.test('denies agentmemory state mutation tools', async () => {
    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'agentmemory_memory_write',
        sessionID: 'session-explore-test',
        callID: 'call3'
      }, { args: {} });
    }, /Permission denied: MCP 'agentmemory' is disabled/);
  });

  await t.test('preserves high-priority read-denial on sensitive .env files', async () => {
    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'read',
        sessionID: 'session-explore-test',
        callID: 'call4'
      }, { args: { path: '.env' } });
    }, /Permission denied: Reading sensitive env files is blocked/);

    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'read',
        sessionID: 'session-explore-test',
        callID: 'call4'
      }, { args: { path: 'config/.env.production' } });
    }, /Permission denied: Reading sensitive env files is blocked/);

    // .env.example must succeed
    await assert.doesNotReject(async () => {
      await plugin["tool.execute.before"]({
        tool: 'read',
        sessionID: 'session-explore-test',
        callID: 'call4'
      }, { args: { path: 'config/.env.example' } });
    });
  });
});

test('Explore Agent - Bash Blocklists & Bypass Interception', async (t) => {
  const plugin = await SafetyPlugin({ directory: __dirname });

  // Simulate starting explore agent session
  await plugin["chat.message"]({
    sessionID: 'session-explore-test',
    agent: 'explore'
  }, { message: {}, parts: [] });

  await t.test('blocks destructive commands', async () => {
    const destructive = [
      'git checkout branch',
      'git restore file',
      'git merge main',
      'git reset --hard HEAD',
      'git stash push',
      'cp file1 file2',
      'chmod 755 script',
      'ln -s f1 f2',
      'touch newfile',
      'truncate -s 0 file',
      'tee output',
      'rm -rf test',
      'mv src dest',
      'mkdir folder',
      'npm install package'
    ];

    for (const cmd of destructive) {
      await assert.rejects(async () => {
        await plugin["tool.execute.before"]({
          tool: 'bash',
          sessionID: 'session-explore-test',
          callID: 'call'
        }, { args: { command: cmd } });
      }, new RegExp(`Permission denied: Command .* is blocked`), `Expected '${cmd}' to be blocked`);
    }
  });

  await t.test('blocks in-place sed write flags', async () => {
    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: 'sed -i "s/foo/bar/g" file' } });
    }, /Permission denied: Command .* is blocked/);

    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: 'sed --in-place "s/foo/bar/g" file' } });
    }, /Permission denied: Command .* is blocked/);

    // Read-only sed must succeed
    await assert.doesNotReject(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: 'sed "s/foo/bar/g" file' } });
    });
  });

  await t.test('blocks shell write redirections', async () => {
    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: 'ls > output.txt' } });
    }, /Permission denied: Write redirection operator is blocked/);

    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: 'ls >> output.txt' } });
    }, /Permission denied: Write redirection operator is blocked/);

    // Comparators (e.g. inside awk) must not trigger redirection block
    await assert.doesNotReject(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: "awk '$1 > 5'" } });
    });

    // Stream redirection (2>&1) must not trigger redirection block
    await assert.doesNotReject(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: 'git log 2>&1' } });
    });
  });

  await t.test('blocks chaining attempts containing blocked commands', async () => {
    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: 'ls && rm file' } });
    }, /Permission denied: Command .* is blocked/);

    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-test',
        callID: 'call'
      }, { args: { command: 'pwd; touch f' } });
    }, /Permission denied: Command .* is blocked/);
  });
});

test('Explore Agent - Allowed Exploration Utilities', async (t) => {
  const plugin = await SafetyPlugin({ directory: __dirname });

  await plugin["chat.message"]({
    sessionID: 'session-explore-test',
    agent: 'explore'
  }, { message: {}, parts: [] });

  await t.test('allows non-destructive reading & git commands', async () => {
    const allowed = [
      'ls',
      'ls *',
      'pwd',
      'cat package.json',
      'head -n 10 file',
      'tail file',
      'find .',
      'rg pattern',
      'grep pattern',
      'git status',
      'git diff',
      'git log',
      'git show',
      'git branch',
      'git stash list',
      'rtk ls',
      'rtk cat package.json',
      'rtk git log',
      'ls && pwd'
    ];

    for (const cmd of allowed) {
      await assert.doesNotReject(async () => {
        await plugin["tool.execute.before"]({
          tool: 'bash',
          sessionID: 'session-explore-test',
          callID: 'call'
        }, { args: { command: cmd } });
      }, `Expected allowed command '${cmd}' to succeed`);
    }
  });
});

test('Explore Agent - blocks every sed in-place option form', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });

  await plugin["chat.message"]({
    sessionID: 'session-explore-sed-flags',
    agent: 'explore'
  }, { message: {}, parts: [] });

  const commands = [
    'sed -i.bak "s/foo/bar/g" file',
    'sed -Ei "s/foo/bar/g" file',
    'sed --in-place=.bak "s/foo/bar/g" file'
  ];

  for (const command of commands) {
    await assert.rejects(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-sed-flags',
        callID: command
      }, { args: { command } });
    }, /Permission denied: Command .* is blocked/, `Expected '${command}' to be blocked`);
  }
});

test('Explore Agent - allows read-only search commands even when arguments name blocked executables', async () => {
  const plugin = await SafetyPlugin({ directory: __dirname });

  await plugin["chat.message"]({
    sessionID: 'session-explore-executable-matching',
    agent: 'explore'
  }, { message: {}, parts: [] });

  const commands = [
    'rg rm',
    'grep touch file',
    'rtk rg rm'
  ];

  for (const command of commands) {
    await assert.doesNotReject(async () => {
      await plugin["tool.execute.before"]({
        tool: 'bash',
        sessionID: 'session-explore-executable-matching',
        callID: command
      }, { args: { command } });
    }, `Expected read-only command '${command}' to remain allowed`);
  }
});
