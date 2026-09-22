const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

async function router() {
  return import('../scripts/recommend-reviewers.mjs');
}

test('recommends reviewers for positive and uncertain TypeSafe judgments', async () => {
  const { recommendReviewers } = await router();
  const client = {
    async systemOne() {
      return {
        answers: {
          'architecture-boundary-reviewer': { noul: 0.9 },
          'performance-reviewer': { noul: 0.1 },
          'production-readiness-reviewer': { noul: 0.5 },
          'test-reviewer': { noul: 0.8 },
          'security-audit-reviewer': { noul: 0.9 },
          'frontend-a11y-reviewer': { noul: 0.1 },
        },
      };
    },
  };

  const result = await recommendReviewers({ files: 'M plugins/example.ts', stat: '1 file changed' }, client);

  assert.equal(result.source, 'typesafe');
  assert.deepEqual(result.selectedReviewers, ['architecture-boundary-reviewer', 'production-readiness-reviewer', 'test-reviewer', 'security-audit-reviewer']);
  assert.deepEqual(
    result.recommendations.map(({ reviewer, decision }) => [reviewer, decision]),
    [
      ['architecture-boundary-reviewer', 'selected'],
      ['performance-reviewer', 'not-selected'],
      ['production-readiness-reviewer', 'uncertain'],
      ['test-reviewer', 'selected'],
      ['security-audit-reviewer', 'selected'],
      ['frontend-a11y-reviewer', 'not-selected'],
    ],
  );
});

test('asks all independent reviewer questions in one request', async () => {
  const { recommendReviewers } = await router();
  let request;
  const client = {
    async systemOne(input) {
      request = input;
      return {
        answers: Object.fromEntries(
          Object.keys(input.questions).map((name) => [name, { noul: 0 }]),
        ),
      };
    },
  };

  await recommendReviewers({ files: 'M README.md', stat: '1 file changed' }, client);

  assert.deepEqual(Object.keys(request.questions), [
    'architecture-boundary-reviewer',
    'performance-reviewer',
    'production-readiness-reviewer',
    'test-reviewer',
    'security-audit-reviewer',
    'frontend-a11y-reviewer',
  ]);
  assert.equal(request.state.change.files, 'M README.md');
});

test('includes untracked files and derived metadata in the routing state', async () => {
  const { changeMetadata } = await router();
  const calls = [];
  const metadata = changeMetadata((args) => {
    calls.push(args);
    const command = args.length > 0 ? args[0] : undefined;
    if (command === 'status') {
      return ' M README.md\n?? scripts/recommend-reviewers.mjs\n?? tests/recommend-reviewers.test.js\nA  commands/code-review.md\n M package-lock.json';
    }
    return ' README.md | 1 +\n 2 files changed, 1 insertion(+)';
  });

  assert.deepEqual(calls, [
    ['status', '--porcelain=v1', '--untracked-files=all'],
    ['diff', '--stat', 'HEAD'],
  ]);
  assert.equal(metadata.summary.fileCount, 5);
  assert.equal(metadata.summary.newFileCount, 3);
  assert.equal(metadata.summary.testFiles, 1);
  assert.equal(metadata.summary.scriptFiles, 1);
  assert.equal(metadata.summary.dependencyFiles, 1);
  assert.equal(metadata.summary.workflowFiles, 1);
  assert.deepEqual(metadata.summary.extensions, { md: 2, mjs: 1, js: 1, json: 1 });
});

test('uses bounded, no-retry options for TypeSafe routing', async () => {
  const { recommendReviewers } = await router();
  let options;
  const client = {
    async systemOne(_input, requestOptions) {
      options = requestOptions;
      return {
        answers: {
          'architecture-boundary-reviewer': { noul: 0 },
          'performance-reviewer': { noul: 0 },
          'production-readiness-reviewer': { noul: 0 },
          'test-reviewer': { noul: 0 },
          'security-audit-reviewer': { noul: 0 },
          'frontend-a11y-reviewer': { noul: 0 },
        },
      };
    },
  };

  await recommendReviewers({ files: 'M README.md', stat: '1 file changed' }, client);

  assert.deepEqual(options, { timeout: 3000, retry: { maxRetries: 0 } });
});

test('returns fallback JSON when Git metadata collection fails', async () => {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/recommend-reviewers.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PATH: '' },
  });

  assert.equal(JSON.parse(stdout).source, 'fallback');
});
