const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matches(pattern, value) {
  const source = escapeRegExp(pattern).replace(/\\\*/g, '.*').replace(/\\\?/g, '.');
  return new RegExp(`^${source}$`).test(value);
}

test('Explore Agent - V2 permissions stay fail-closed, MCP-free, and read-only', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'agents', 'explore.md'), 'utf8');
  const frontMatterMatch = source.match(/^---\n([\s\S]*?)\n---/);

  assert.ok(frontMatterMatch, 'Expected agents/explore.md to start with front matter');

  const frontMatter = frontMatterMatch[1];
  assert.doesNotMatch(frontMatter, /^permission:|^mcp:/m, 'Expected only V2 permissions and no embedded MCP config');
  const ruleText = frontMatter.split(/^permissions:\n/m)[1];
  assert.ok(ruleText, 'Expected V2 permissions in the explore agent front matter');

  const rulePattern = /^ {2}- action: ("[^"]+")\n {4}resource: ("[^"]+")\n {4}effect: (allow|deny|ask)$/gm;
  const entries = [...ruleText.matchAll(rulePattern)];
  assert.ok(entries.length > 0, 'Expected at least one V2 permission rule');
  assert.equal(entries.map(([text]) => text).join('\n'), ruleText.trimEnd(), 'Expected only ordered V2 permission rules');
  const rules = entries.map(([, action, resource, effect]) => ({
    action: JSON.parse(action),
    resource: JSON.parse(resource),
    effect,
  }));
  assert.deepEqual(rules.slice(0, 1), [{ action: '*', resource: '*', effect: 'deny' }]);

  function effect(action, resource) {
    return rules.reduce((result, rule) =>
      matches(rule.action, action) && matches(rule.resource, resource) ? rule.effect : result, 'deny');
  }

  for (const action of ['edit', 'subagent', 'execute', 'mcp_example', 'agentmemory_memory_save']) {
    assert.equal(effect(action, '*'), 'deny', `Expected ${action} to stay denied`);
  }
  for (const action of ['glob', 'grep', 'webfetch', 'websearch', 'skill', 'question']) {
    assert.equal(effect(action, '*'), 'allow', `Expected ${action} to stay available`);
  }
  assert.equal(effect('read', 'src/example.ts'), 'allow');
  assert.equal(effect('read', '.env'), 'deny');
  assert.equal(effect('read', '.env.local'), 'deny');
  assert.equal(effect('read', '.env.example'), 'allow');

  for (const command of [
    'ls src', 'pwd', 'cat README.md', 'head README.md', 'tail README.md',
    'rg TODO', 'grep TODO README.md', 'git status', 'git diff', 'git log', 'git show',
  ]) {
    assert.equal(effect('shell', command), 'allow', `Expected ${command} to remain allowed`);
  }
  for (const command of [
    'find src', 'git diff --stat', 'git log -1', 'git branch --delete main',
    'sed -i s/a/b/ file', 'awk {print} file', 'rm file',
  ]) {
    assert.equal(effect('shell', command), 'deny', `Expected ${command} to remain denied`);
  }
});
