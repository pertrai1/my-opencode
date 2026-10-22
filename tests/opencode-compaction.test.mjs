import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createRequire } from 'node:module';

test('compaction loads through the v2 schema with a 12000-token buffer', async () => {
  const schemaRequire = createRequire(import.meta.resolve('@opencode/schema/config/compaction'));
  const { Schema } = await import(schemaRequire.resolve('effect'));
  const { ConfigCompaction } = await import('@opencode/schema/config/compaction');
  const filename = fileURLToPath(new URL('../opencode.jsonc', import.meta.url));
  const { config, error } = ts.parseConfigFileTextToJson(filename, fs.readFileSync(filename, 'utf8'));
  assert.equal(error, undefined);
  const loaded = Schema.decodeUnknownSync(ConfigCompaction.Info, { onExcessProperty: 'error' })(config.compaction);
  assert.equal(loaded.auto, true);
  assert.equal(loaded.buffer, 12000);
});
