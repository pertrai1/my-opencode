const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Dynamic TypeScript compilation hook using the typescript devDependency.
// This allows the safety tests to run flawlessly on older Node versions (like Node 20)
// that lack out-of-the-box type stripping, while keeping the TS plugin source in place.
const originalTsExtension = require.extensions && require.extensions['.ts'];
if (require.extensions && !originalTsExtension) {
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

const { SafetyPlugin } = require('../plugins/safety.ts');

// Helper to create a temp project directory with opencode.jsonc for testing
function createMockProjectDir(safetyConfig) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-test-'));
  const config = {
    "$schema": "https://opencode.ai/config.json",
    "safety": safetyConfig
  };
  fs.writeFileSync(path.join(tmpDir, 'opencode.jsonc'), JSON.stringify(config, null, 2));
  return tmpDir;
}

test('Safety Plugin - Output Size Truncation', async (t) => {
  await t.test('truncates output over maxLength using head / tail split and saves full output', async () => {
    const tempDirName = path.join(os.tmpdir(), `opencode-tmp-${Date.now()}`);
    const mockDir = createMockProjectDir({
      truncation: {
        maxLength: 30,
        headLength: 20,
        tailLength: 10,
        tempDir: tempDirName,
        retentionHours: 24,
        maxTempDirSizeMB: 100
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    
    const input = {
      tool: 'bash',
      sessionID: 'session123',
      callID: 'call1',
      args: { command: 'echo "hello"' }
    };
    
    // 50 characters of content
    const longOutput = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWX';
    const output = {
      title: 'bash execution',
      output: longOutput,
      metadata: {}
    };

    await plugin["tool.execute.after"](input, output);

    // Verify it was truncated
    assert.ok(output.output.length > 0);
    assert.ok(output.output.includes('[WARNING: Output truncated at 30 characters.'));
    
    // Check that head (first 20) and tail (last 10) are correct
    const expectedHead = longOutput.slice(0, 20); // abcdefghijklmnopqrst
    const expectedTail = longOutput.slice(-10); // IJKLMNOPQRSTUVWX
    
    assert.ok(output.output.startsWith(expectedHead));
    assert.ok(output.output.endsWith(expectedTail));

    // Verify raw output is saved to tempDirName with 0600 permissions
    const files = fs.readdirSync(tempDirName);
    assert.strictEqual(files.length, 1);
    const savedFileName = files.length > 0 ? files[0] : undefined;
    assert.ok(savedFileName, 'Expected retained output file to exist');
    const savedFilePath = path.join(tempDirName, savedFileName);
    const savedContent = fs.readFileSync(savedFilePath, 'utf8');
    assert.strictEqual(savedContent, longOutput);

    // Verify permissions (0600 on file, 0700 on directory)
    const fileStat = fs.statSync(savedFilePath);
    const dirStat = fs.statSync(tempDirName);
    
    // Check owner read/write
    assert.strictEqual(fileStat.mode & 0o777, 0o600);
    assert.strictEqual(dirStat.mode & 0o777, 0o700);

    // Clean up
    fs.unlinkSync(savedFilePath);
    fs.rmdirSync(tempDirName);
    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('pruning of older files and size constraints works', async () => {
    const tempDirName = path.join(os.tmpdir(), `opencode-prune-${Date.now()}`);
    fs.mkdirSync(tempDirName, { recursive: true, mode: 0o700 });

    const mockDir = createMockProjectDir({
      truncation: {
        maxLength: 10,
        headLength: 5,
        tailLength: 5,
        tempDir: tempDirName,
        retentionHours: 24,
        maxTempDirSizeMB: 0.001 // 1024 bytes
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });

    // 1. Create a simulated older file (e.g. 25 hours old) to verify age pruning
    const oldFilePath = path.join(tempDirName, 'opencode-full-out-session123-12345-old.txt');
    fs.writeFileSync(oldFilePath, 'some old content', { mode: 0o600 });
    const pastTime = Date.now() - 25 * 60 * 60 * 1000;
    fs.utimesSync(oldFilePath, new Date(pastTime), new Date(pastTime));

    // 2. Create two retained artifacts and one unrelated file. The directory exceeds
    // the size limit only when all files are counted, so pruning must consider total
    // directory size but only delete OpenCode-owned artifacts.
    // File A: 400 bytes, created 10 mins ago
    const fileAPath = path.join(tempDirName, 'opencode-full-out-session123-A.txt');
    fs.writeFileSync(fileAPath, 'A'.repeat(400), { mode: 0o600 });
    const timeA = Date.now() - 10 * 60 * 1000;
    fs.utimesSync(fileAPath, new Date(timeA), new Date(timeA));

    // File B: 400 bytes, created 5 mins ago
    const fileBPath = path.join(tempDirName, 'opencode-full-out-session123-B.txt');
    fs.writeFileSync(fileBPath, 'B'.repeat(400), { mode: 0o600 });
    const timeB = Date.now() - 5 * 60 * 1000;
    fs.utimesSync(fileBPath, new Date(timeB), new Date(timeB));

    // 3. Create a non-OpenCode file in the directory to verify it is NOT pruned by age
    // or size limits, even though it contributes to the total directory size.
    const nonOpencodeFilePath = path.join(tempDirName, 'user-precious-file.txt');
    fs.writeFileSync(nonOpencodeFilePath, 'precious user data'.repeat(25), { mode: 0o600 });
    // Make it old to verify age pruning also ignores it
    const pastTimeNon = Date.now() - 25 * 60 * 60 * 1000;
    fs.utimesSync(nonOpencodeFilePath, new Date(pastTimeNon), new Date(pastTimeNon));

    // Execute tool call that triggers truncation and thus pruning
    const input = { tool: 'bash', sessionID: 'session123', callID: 'call1', args: {} };
    const output = { title: 'bash', output: 'abcdefghijklmnopqrstuvwxyz', metadata: {} };

    await plugin["tool.execute.after"](input, output);

    // Verify the old file (25h old) was pruned
    assert.ok(!fs.existsSync(oldFilePath), 'Expected 25h old file to be pruned');

    // Verify that the non-OpenCode file was NOT deleted by age or size pruning
    assert.ok(fs.existsSync(nonOpencodeFilePath), 'Expected non-OpenCode file to be preserved');

    // Verify directory-size cleanup: File A (oldest, 10 mins ago) should be pruned because
    // total directory size exceeds 1024 bytes once the unrelated file is included.
    // File B, the unrelated file, and the newly created File C should remain.
    assert.ok(!fs.existsSync(fileAPath), 'Expected oldest file A to be deleted due to directory size constraints');
    assert.ok(fs.existsSync(fileBPath), 'Expected file B to remain');

    // Check that a new output file remains in the directory
    const files = fs.readdirSync(tempDirName);
    const hasNewFile = files.some(f => f.startsWith('opencode-full-out-') && f.endsWith('.txt') && !f.includes('A') && !f.includes('B'));
    assert.ok(hasNewFile, 'Expected newest truncated output file to remain');

    // Clean up
    fs.rmSync(tempDirName, { recursive: true, force: true });
    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('truncates Unicode code points correctly without splitting surrogate pairs', async () => {
    const tempDirName = path.join(os.tmpdir(), `opencode-unicode-${Date.now()}`);
    const mockDir = createMockProjectDir({
      truncation: {
        maxLength: 5,
        headLength: 2,
        tailLength: 2,
        tempDir: tempDirName,
        retentionHours: 24,
        maxTempDirSizeMB: 100
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const input = { tool: 'bash', sessionID: 'session-unicode', callID: 'call1', args: {} };
    
    // Each emoji is 1 Unicode code point, but 2 UTF-16 code units (length 2)
    // "😀😃😄😁😆😅" is 6 emojis (6 code points, length 12 in UTF-16)
    // maxLength is 5, so 6 emojis should trigger truncation!
    const emojiOutput = "😀😃😄😁😆😅";
    const output = { title: 'bash', output: emojiOutput, metadata: {} };

    await plugin["tool.execute.after"](input, output);

    // Expected head: first 2 emojis "😀😃"
    // Expected tail: last 2 emojis "😆😅"
    assert.ok(output.output.startsWith("😀😃"));
    assert.ok(output.output.endsWith("😆😅"));
    assert.ok(output.output.includes('[WARNING: Output truncated at 5 characters.'));

    fs.rmSync(tempDirName, { recursive: true, force: true });
    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('sanitizes session IDs before using them in retained output filenames', async () => {
    const tempDirName = path.join(os.tmpdir(), `opencode-sanitize-${Date.now()}`);
    const mockDir = createMockProjectDir({
      truncation: {
        maxLength: 10,
        headLength: 5,
        tailLength: 5,
        tempDir: tempDirName,
        retentionHours: 24,
        maxTempDirSizeMB: 100
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const input = { tool: 'bash', sessionID: '../nested/session', callID: 'call1', args: {} };
    const output = { title: 'bash', output: 'abcdefghijklmnopqrstuvwxyz', metadata: {} };

    await plugin["tool.execute.after"](input, output);

    const files = fs.readdirSync(tempDirName);
    assert.strictEqual(files.length, 1);
    const savedFileName = files.length > 0 ? files[0] : undefined;
    assert.ok(savedFileName, 'Expected retained output file to exist');
    assert.match(savedFileName, /^opencode-full-out-[^/\\]+-\d+-[a-f0-9]{6}\.txt$/);
    assert.ok(!savedFileName.includes('..'));

    fs.rmSync(tempDirName, { recursive: true, force: true });
    fs.rmSync(mockDir, { recursive: true });
  });
});

test('Safety Plugin - Doom Loop Detection', async (t) => {
  await t.test('detects consecutive loop A-A-A and aborts', async () => {
    const mockDir = createMockProjectDir({
      doomLoop: {
        enabled: true,
        bufferSize: 5,
        maxRepetitions: 3,
        exemptTools: ["read", "grep", "glob"],
        postAbortAction: "hard_error"
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const sessionID = 'session-loop-consecutive';

    const call1 = { tool: 'bash', sessionID, callID: 'c1', args: { command: 'test' } };
    const res1 = { title: 'bash', output: 'ok', metadata: {} };

    // First and second execution of same tool call
    await plugin["tool.execute.after"](call1, res1);
    await plugin["tool.execute.after"](call1, res1);

    // Third execution must throw Doom Loop error
    let errorOccurred = null;
    try {
      await plugin["tool.execute.after"](call1, res1);
    } catch (error) {
      errorOccurred = error;
    }

    assert.ok(errorOccurred, 'Expected doom loop error to be thrown');
    assert.ok(errorOccurred.message.includes('[DOOM LOOP DETECTED]'));

    // Clean up
    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('detects alternating loop A-B-A-B-A and aborts', async () => {
    const mockDir = createMockProjectDir({
      doomLoop: {
        enabled: true,
        bufferSize: 5,
        maxRepetitions: 3,
        exemptTools: ["read", "grep", "glob"],
        postAbortAction: "hard_error"
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const sessionID = 'session-loop-alternating';

    const callA = { tool: 'bash', sessionID, callID: 'cA', args: { command: 'A' } };
    const resA = { title: 'bash', output: 'resA', metadata: {} };

    const callB = { tool: 'bash', sessionID, callID: 'cB', args: { command: 'B' } };
    const resB = { title: 'bash', output: 'resB', metadata: {} };

    // Sequence: A -> B -> A -> B
    await plugin["tool.execute.after"](callA, resA);
    await plugin["tool.execute.after"](callB, resB);
    await plugin["tool.execute.after"](callA, resA);
    await plugin["tool.execute.after"](callB, resB);

    // Next A execution completes the loop (3rd A in a 5-entry window)
    let errorOccurred = null;
    try {
      await plugin["tool.execute.after"](callA, resA);
    } catch (error) {
      errorOccurred = error;
    }

    assert.ok(errorOccurred, 'Expected alternating doom loop error');
    assert.ok(errorOccurred.message.includes('[DOOM LOOP DETECTED]'));

    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('ignores legitimate polling when outputs change', async () => {
    const mockDir = createMockProjectDir({
      doomLoop: {
        enabled: true,
        bufferSize: 5,
        maxRepetitions: 3,
        exemptTools: ["read"],
        postAbortAction: "hard_error"
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const sessionID = 'session-polling';

    const call = { tool: 'bash', sessionID, callID: 'poll1', args: { command: 'status' } };

    // Outputs change on every call
    await plugin["tool.execute.after"](call, { title: 'bash', output: 'progress 10%', metadata: {} });
    await plugin["tool.execute.after"](call, { title: 'bash', output: 'progress 40%', metadata: {} });
    await plugin["tool.execute.after"](call, { title: 'bash', output: 'progress 80%', metadata: {} });
    await plugin["tool.execute.after"](call, { title: 'bash', output: 'complete', metadata: {} });

    // No error should be thrown since outputs are changing!
    assert.ok(true, 'Polling with changing outputs did not trigger loop detection');

    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('exempt tools are not tracked for loop detection', async () => {
    const mockDir = createMockProjectDir({
      doomLoop: {
        enabled: true,
        bufferSize: 5,
        maxRepetitions: 3,
        exemptTools: ["read"],
        postAbortAction: "hard_error"
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const sessionID = 'session-exempt';

    const callExempt = { tool: 'read', sessionID, callID: 'r1', args: { path: 'a.txt' } };
    const resExempt = { title: 'read', output: 'content', metadata: {} };

    // Execute many times - should NOT throw because read is exempt
    await plugin["tool.execute.after"](callExempt, resExempt);
    await plugin["tool.execute.after"](callExempt, resExempt);
    await plugin["tool.execute.after"](callExempt, resExempt);
    await plugin["tool.execute.after"](callExempt, resExempt);

    assert.ok(true, 'Exempt tool did not trigger loop detection');

    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('safe read-only tools are not tracked by default', async () => {
    const mockDir = createMockProjectDir({
      doomLoop: {
        enabled: true,
        bufferSize: 5,
        maxRepetitions: 3,
        exemptTools: [],
        postAbortAction: "hard_error"
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const sessionID = 'session-read-only';
    const call = { tool: 'read', sessionID, callID: 'r1', args: { filePath: 'a.txt' } };
    const res = { title: 'read', output: 'content', metadata: {} };

    await plugin["tool.execute.after"](call, res);
    await plugin["tool.execute.after"](call, res);
    await plugin["tool.execute.after"](call, res);
    await plugin["tool.execute.after"](call, res);

    assert.ok(true, 'Read-only tool did not trigger loop detection without explicit exemption');

    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('buffer resets on new user message', async () => {
    const mockDir = createMockProjectDir({
      doomLoop: {
        enabled: true,
        bufferSize: 5,
        maxRepetitions: 3,
        exemptTools: [],
        postAbortAction: "hard_error"
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const sessionID = 'session-reset';

    const call = { tool: 'bash', sessionID, callID: 'c1', args: {} };
    const res = { title: 'bash', output: 'ok', metadata: {} };

    await plugin["tool.execute.after"](call, res);
    await plugin["tool.execute.after"](call, res); // 2 times

    // Simulate new user message received
    await plugin["chat.message"]({ sessionID });

    // Buffer is reset! This next call is considered the 1st repetition again, not the 3rd.
    await plugin["tool.execute.after"](call, res);
    await plugin["tool.execute.after"](call, res); // 2 times again

    assert.ok(true, 'Rolling buffer reset successfully on new user message');

    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('detects doom loop for three identical oversized calls', async () => {
    const tempDirName = path.join(os.tmpdir(), `opencode-doom-oversized-${Date.now()}`);
    const mockDir = createMockProjectDir({
      truncation: {
        maxLength: 10,
        headLength: 5,
        tailLength: 5,
        tempDir: tempDirName,
        retentionHours: 24,
        maxTempDirSizeMB: 100
      },
      doomLoop: {
        enabled: true,
        bufferSize: 5,
        maxRepetitions: 3,
        exemptTools: [],
        postAbortAction: "hard_error"
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const sessionID = 'session-doom-oversized';

    const call = { tool: 'bash', sessionID, callID: 'c1', args: { command: 'oversized' } };
    const res1 = { title: 'bash', output: 'abcdefghijklmnopqrstuvwxyz', metadata: {} };
    const res2 = { title: 'bash', output: 'abcdefghijklmnopqrstuvwxyz', metadata: {} };
    const res3 = { title: 'bash', output: 'abcdefghijklmnopqrstuvwxyz', metadata: {} };

    // Execute twice
    await plugin["tool.execute.after"](call, res1);
    await plugin["tool.execute.after"](call, res2);

    // Third call must throw Doom Loop error
    let errorOccurred = null;
    try {
      await plugin["tool.execute.after"](call, res3);
    } catch (error) {
      errorOccurred = error;
    }

    assert.ok(errorOccurred, 'Expected doom loop error for oversized calls');
    assert.ok(errorOccurred.message.includes('[DOOM LOOP DETECTED]'));

    fs.rmSync(tempDirName, { recursive: true, force: true });
    fs.rmSync(mockDir, { recursive: true });
  });

  await t.test('supports postAbortAction set to interactive_pause and throws pause error on doom loop', async () => {
    const mockDir = createMockProjectDir({
      doomLoop: {
        enabled: true,
        bufferSize: 5,
        maxRepetitions: 3,
        exemptTools: [],
        postAbortAction: "interactive_pause"
      }
    });

    const plugin = await SafetyPlugin({ directory: mockDir });
    const sessionID = 'session-pause-test';
    const call = { tool: 'bash', sessionID, callID: 'c1', args: {} };
    const res = { title: 'bash', output: 'ok', metadata: {} };

    await plugin["tool.execute.after"](call, res);
    await plugin["tool.execute.after"](call, res);

    let errorOccurred = null;
    try {
      await plugin["tool.execute.after"](call, res);
    } catch (error) {
      errorOccurred = error;
    }

    assert.ok(errorOccurred, 'Expected error to be thrown on loop detection with interactive_pause');
    assert.ok(errorOccurred.message.includes("Interactive pause triggered"));

    fs.rmSync(mockDir, { recursive: true });
  });
});

test('Safety Plugin - JSONC Parsing of comments and string //', async (t) => {
  await t.test('correctly parses JSONC when strings contain //', async () => {
    const mockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-jsonc-test-'));
    const resolvedPath = path.join(mockDir, "inspect // temporary files");
    const configContent = `{
      // This is a comment
      "safety": {
        "truncation": {
          "maxLength": 50,
          "tempDir": ${JSON.stringify(resolvedPath)}
        }
      }
    }`;
    fs.writeFileSync(path.join(mockDir, 'opencode.jsonc'), configContent);

    // Call loadSafetyConfig or verify it via SafetyPlugin
    const plugin = await SafetyPlugin({ directory: mockDir });
    const input = { tool: 'bash', sessionID: 'session-jsonc', callID: 'call1', args: {} };
    // Trigger truncation with output > 50 chars to verify maxLength is 50 (configured) and not 30000 (default)
    const output = { title: 'bash', output: 'a'.repeat(60), metadata: {} };

    await plugin["tool.execute.after"](input, output);

    // Verify it was truncated at 50 chars
    assert.ok(output.output.includes('[WARNING: Output truncated at 50 characters.'));
    
    // Verify custom tempDir was used and contains "//" correctly parsed
    assert.ok(fs.existsSync(resolvedPath), 'Expected temporary files dir with // to exist');

    fs.rmSync(mockDir, { recursive: true, force: true });
  });
});
