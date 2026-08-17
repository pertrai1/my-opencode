const test = require('node:test');
const assert = require('node:assert');

require('./helpers/register-ts');

const {
  buildScanArgs,
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
