const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Explore Agent - front matter stays flattened, fail-closed, MCP-free, and read-only', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'agents', 'explore.md'), 'utf8');
  const frontMatterMatch = source.match(/^---\n([\s\S]*?)\n---/);

  assert.ok(frontMatterMatch, 'Expected agents/explore.md to start with front matter');

  const frontMatter = frontMatterMatch[1];

  assert.match(frontMatter, /^permission:\n/m, 'Expected a permission mapping in the explore agent front matter');
  assert.match(frontMatter, /^ {2}"\*": deny$/m, 'Expected the explore agent policy to fail closed by default');
  assert.doesNotMatch(frontMatter, /^ {4}permission:\s*$/m, 'Expected no nested permission key inside scoped rule maps');
  assert.match(frontMatter, /^ {2}read:\n/m, 'Expected a scoped read rule map in the flattened permission mapping');
  assert.match(frontMatter, /^ {2}bash:\n/m, 'Expected a scoped bash rule map in the flattened permission mapping');
  assert.doesNotMatch(frontMatter, /^mcp:\s*$/m, 'Expected no embedded MCP configuration in explore agent front matter');

  for (const toolName of [
    'agentmemory_memory_audit',
    'agentmemory_memory_export',
    'agentmemory_memory_governance_delete',
    'agentmemory_memory_recall',
    'agentmemory_memory_save',
    'agentmemory_memory_sessions',
    'agentmemory_memory_smart_search',
  ]) {
    assert.match(frontMatter, new RegExp(`^  ${escapeRegExp(toolName)}: deny$`, 'm'), `Expected ${toolName} to be denied`);
  }

  for (const allowedCommand of [
    'ls *',
    'pwd',
    'cat *',
    'head *',
    'tail *',
    'rg *',
    'grep *',
    'git status',
    'git diff',
    'git log',
    'git show',
  ]) {
    assert.match(frontMatter, new RegExp(`"${escapeRegExp(allowedCommand)}": allow`), `Expected ${allowedCommand} to remain explicitly allowed`);
  }

  for (const forbiddenBroadAllow of [
    'find *',
    'git diff *',
    'git log *',
    'git branch *',
    'sed *',
    'awk *',
  ]) {
    assert.doesNotMatch(frontMatter, new RegExp(`"${escapeRegExp(forbiddenBroadAllow)}": allow`), `Expected mutation-capable shell form ${forbiddenBroadAllow} to stay excluded`);
  }
});
