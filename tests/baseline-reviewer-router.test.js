const test = require('node:test');
const assert = require('node:assert/strict');

async function baseline() {
  return import('../scripts/baseline-reviewer-router.mjs');
}

test('historical fixtures reconstruct the existing router metadata shape', async () => {
  const { fixtureChange } = await baseline();
  const calls = [];
  const change = fixtureChange({ id: 'example', commit: 'abc' }, (args) => {
    calls.push(args);
    return args.includes('diff-tree') ? 'A\tsrc/index.ts\nM\tsrc/index.test.ts' : ' 2 files changed';
  });
  assert.equal(change.files, 'A  src/index.ts\n M src/index.test.ts');
  assert.equal(change.summary.fileCount, 2);
  assert.equal(change.summary.newFileCount, 1);
  assert.equal(change.summary.testFiles, 1);
  assert.deepEqual(calls, [
    ['diff-tree', '--no-commit-id', '--name-status', '--no-renames', '-r', 'abc'],
    ['show', '--format=', '--stat', '--no-renames', 'abc'],
  ]);
});

test('evaluation separates disputed labels and fallbacks from accuracy denominators', async () => {
  const { evaluate, summarize, render } = await baseline();
  const fixtures = [
    { id: 'one', synthetic: { files: ' M src/ui.tsx', stat: '1 file changed' },
      expected: ['frontend-a11y-reviewer'], disputed: ['test-reviewer'], reason: 'UI change' },
    { id: 'two', synthetic: { files: ' M src/auth.ts', stat: '1 file changed' },
      expected: ['security-audit-reviewer'], reason: 'Authentication change' },
    { id: 'three', synthetic: { files: ' M README.md', stat: '1 file changed' },
      expected: [], reason: 'Docs change' },
  ];
  const times = [0, 12, 12, 21, 21, 24];
  const cases = await evaluate(fixtures, {
    now: () => times.shift(),
    makeClient: () => ({ systemOne: async () => ({ model: 'jev-test', usage: { input_tokens: 10, output_tokens: 2 } }) }),
    route: async (change, client) => {
      if (change.files.includes('README')) throw new Error('service unavailable');
      await client.systemOne({ questions: { reviewer: { type: 'noul' } } }, {});
      return { source: 'typesafe', selectedReviewers: change.files.includes('ui')
        ? ['test-reviewer', 'security-audit-reviewer']
        : ['security-audit-reviewer'] };
    },
  });
  const summary = summarize(cases);
  assert.equal(summary.completed, 2);
  assert.equal(summary.fallback, 1);
  assert.equal(summary.meanLatencyMs, 8);
  assert.deepEqual(summary.tokenTotals, { input: 20, output: 4 });
  assert.deepEqual(summary.perReviewer['frontend-a11y-reviewer'], {
    missed: 1, unnecessary: 0, labeledPositive: 1, labeledNegative: 1,
  });
  assert.deepEqual(summary.perReviewer['security-audit-reviewer'], {
    missed: 0, unnecessary: 1, labeledPositive: 1, labeledNegative: 1,
  });
  assert.equal(summary.perReviewer['test-reviewer'].unnecessary, 0);
  assert.equal(summary.perReviewer['test-reviewer'].labeledNegative, 1);
  assert.match(render(cases), /Fallbacks: 1\/3/);
  assert.match(render(cases), /Tokens: 20 input, 4 output/);
});

test('fixture validation rejects contradictory labels', async () => {
  const { evaluate } = await baseline();
  await assert.rejects(evaluate([{
    id: 'duplicate', synthetic: { files: ' M file.ts', stat: '1 file changed' },
    expected: ['test-reviewer'], disputed: ['test-reviewer'], reason: 'Conflicting label',
  }]), /duplicate reviewer label/);
});
