import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
const root = resolve(process.argv[2] || '.');
const files = ['sdk-generator.contract', 'cli-command-generator.contract', 'api-translation.contract', 'version-compatibility.contract', 'decision-events'];
const names = ['SdkGeneratorContract', 'CliCommandGeneratorContract', 'ApiTranslationContract', 'VersionCompatibilityContract'];
const modules = await Promise.all(files.map(file => import(pathToFileURL(join(root, 'src/agents/contracts', file + '.ts')).href)));
const barrel = await import(pathToFileURL(join(root, 'src/agents/contracts/index.ts')).href);
const counts = {};
for (const m of modules) for (const key of Object.keys(m)) counts[key] = (counts[key] || 0) + 1;
const holdout = [], anchors = [];
function check(list, name, fn) {
  try { fn(); list.push({ name, passed: true }); }
  catch (error) { list.push({ name, passed: false, error: error.message }); }
}
names.forEach((name, index) => check(holdout, name + ': complete agent-owned exports', () => {
  const namespace = barrel[name];
  assert.ok(namespace, 'Missing public contract namespace: ' + name);
  assert.deepEqual(Object.keys(namespace).sort(), Object.keys(modules[index]).sort());
  for (const key of Object.keys(modules[index])) assert.equal(namespace[key], modules[index][key], name + '.' + key + ' has wrong owner');
}));
modules.forEach((m, index) => check(anchors, files[index] + ': existing unambiguous exports retained', () => {
  for (const key of Object.keys(m).filter(key => counts[key] === 1)) assert.equal(barrel[key], m[key], key + ' changed ownership');
}));
check(anchors, 'Ambiguous metadata is not silently assigned to one agent', () => {
  for (const key of Object.keys(counts).filter(key => counts[key] > 1)) assert.equal(Object.hasOwn(barrel, key), false, key + ' must be accessed through an agent namespace');
});
console.log(JSON.stringify({ holdout, anchors, uniqueExports: Object.keys(counts).filter(k => counts[k] === 1).length, sharedNames: Object.keys(counts).filter(k => counts[k] > 1), passed: [...holdout, ...anchors].every(x => x.passed) }));
process.exitCode = [...holdout, ...anchors].every(x => x.passed) ? 0 : 1;
