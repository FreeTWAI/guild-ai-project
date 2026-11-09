import {afterEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateWorkspace, renderWorkspace} from '../scripts/build.mjs';
const workspaceSource = await readFile(new URL('../workspace.json', import.meta.url), 'utf8');
const workspace = JSON.parse(workspaceSource);

afterEach(() => {
  assert.deepEqual(workspace, JSON.parse(workspaceSource), 'tests must not mutate the shared workspace fixture');
  assert.doesNotThrow(() => validateWorkspace(workspace));
});

test('workspace renders its real guild, workflow, and platform destinations', () => {
  validateWorkspace(workspace);
  if (process.env.GITHUB_REPOSITORY) assert.equal(workspace.repository, process.env.GITHUB_REPOSITORY);
  const html = renderWorkspace(workspace);
  assert.ok(html.includes(`<title>${workspace.name}`));
  for (const step of workspace.steps) assert.ok(html.includes(`https://freetwai.com/#guilds/${workspace.guild_key}/${step.action}`));
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.ok(html.includes("connect-src 'none'"));
});
test('HTML content is escaped and cannot install scripts or links', () => {
  const html = renderWorkspace({...workspace, headline: '<script>alert(1)</script>', outcome: '" onload="run()', steps: workspace.steps.map(step => ({...step, title: '<img src=x onerror=run()>'}))});
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&quot; onload=&quot;run()'));
});
test('an own __proto__ field is rejected without changing the fixture or its prototype', () => {
  const value = {...structuredClone(workspace), ...JSON.parse('{"__proto__": {"polluted": true}}')};
  assert.ok(Object.hasOwn(value, '__proto__'));
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(value.polluted, undefined);
  assert.throws(() => validateWorkspace(value), /Invalid workspace\.json/);
  delete value.__proto__;
  assert.deepEqual(value, workspace);
  assert.doesNotThrow(() => validateWorkspace(value));
});

for (const [name, invalidate] of [
  ['null', () => null],
  ['array', () => []],
  ['unsupported contract', value => ({...value, schema_version: 'v2'})],
  ['private field', value => ({...value, token: 'not-a-secret'})],
  ['invalid guild key', value => ({...value, guild_key: '../outside'})],
  ['untrusted repository', value => ({...value, repository: 'attacker/guild-x'})],
  ['oversized purpose', value => ({...value, purpose: 'a'.repeat(1201)})],
  ['arbitrary URL action', value => ({...value, steps: value.steps.map(step => ({...step, action: 'https://example.com'}))})],
  ['unsupported command', value => ({...value, steps: value.steps.map(step => ({...step, action: 'join'}))})],
]) {
  test(`workspace rejects ${name} from an independently valid fixture`, () => {
    const value = structuredClone(workspace);
    assert.doesNotThrow(() => validateWorkspace(value));
    assert.throws(() => validateWorkspace(invalidate(value)), /Invalid workspace\.json/);
  });
}
