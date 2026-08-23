const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const {
  buildScanArgs,
  buildToastMessage,
  filterIgnoredFindings,
  hasGitleaksFindings,
  parseGitleaksReport,
} = require('../plugins/secret-scan.ts');

test('secret scan parses gitleaks JSON findings into redacted metadata', () => {
  const findings = parseGitleaksReport(JSON.stringify([
    {
      Description: 'OpenAI API Key',
      File: 'src/example.ts',
      StartLine: 7,
      RuleID: 'openai-api-key',
      Fingerprint: 'abc123',
    },
    {
      Description: 'Private Key',
      File: 'keys/dev.pem',
      StartLine: 1,
      RuleID: 'private-key',
    },
  ]));

  assert.deepStrictEqual(findings, [
    {
      description: 'OpenAI API Key',
      filePath: 'src/example.ts',
      fingerprint: 'abc123',
      line: 7,
      ruleId: 'openai-api-key',
    },
    {
      description: 'Private Key',
      filePath: 'keys/dev.pem',
      fingerprint: null,
      line: 1,
      ruleId: 'private-key',
    },
  ]);
});

test('secret scan tolerates empty or non-array gitleaks output', () => {
  assert.deepStrictEqual(parseGitleaksReport(''), []);
  assert.deepStrictEqual(parseGitleaksReport('{}'), []);
});

test('secret scan distinguishes leak findings from scan failures', () => {
  assert.strictEqual(hasGitleaksFindings(''), false);
  assert.strictEqual(hasGitleaksFindings('{}'), false);
  assert.strictEqual(hasGitleaksFindings(JSON.stringify([{ RuleID: 'generic-api-key' }])), true);
});

test('secret scan builds a redacted gitleaks dir command', () => {
  assert.deepStrictEqual(buildScanArgs('/tmp/example'), [
    'gitleaks',
    'dir',
    '/tmp/example',
    '--no-banner',
    '--redact',
    '--report-format',
    'json',
    '--report-path',
    '-',
  ]);
});

test('secret scan filters findings from gitignored files', async () => {
  const findings = [
    {
      description: 'OpenAI API Key',
      filePath: 'tracked.ts',
      fingerprint: 'abc123',
      line: 7,
      ruleId: 'openai-api-key',
    },
    {
      description: 'Service account',
      filePath: 'service.json',
      fingerprint: 'def456',
      line: 1,
      ruleId: 'google-service-account',
    },
  ];
  const expected = {
    description: 'OpenAI API Key',
    filePath: 'tracked.ts',
    fingerprint: 'abc123',
    line: 7,
    ruleId: 'openai-api-key',
  };

  const filtered = await filterIgnoredFindings(findings, async (filePath) => filePath === 'service.json');

  assert.deepStrictEqual(filtered, [expected]);
});

test('secret scan toast message truncates long finding lists', () => {
  const findings = [
    { description: 'd1', filePath: 'a.ts', fingerprint: null, line: 1, ruleId: 'r1' },
    { description: 'd2', filePath: 'b.ts', fingerprint: null, line: 2, ruleId: 'r2' },
    { description: 'd3', filePath: 'c.ts', fingerprint: null, line: 3, ruleId: 'r3' },
    { description: 'd4', filePath: 'd.ts', fingerprint: null, line: 4, ruleId: 'r4' },
    { description: 'd5', filePath: 'e.ts', fingerprint: null, line: 5, ruleId: 'r5' },
    { description: 'd6', filePath: 'f.ts', fingerprint: null, line: 6, ruleId: 'r6' },
  ];

  assert.match(buildToastMessage(findings), /\n\+1 more$/);
});
