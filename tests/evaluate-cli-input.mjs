import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// node evaluate.mjs BASELINE CANDIDATE PINNED_TOOLS OUTPUT
const [baseline, candidate, tools, output] = process.argv.slice(2).map((x) => resolve(x));
const fw = await import(
  pathToFileURL(join(tools, 'node_modules/@metaharness/flywheel/dist/index.js'))
);
assert.equal(
  JSON.parse(readFileSync(join(tools, 'node_modules/@metaharness/flywheel/package.json'))).version,
  '0.1.12'
);
const source = 'src/agents/cli-command-generator/handler.ts';
const fixture = join(candidate, 'tests/service/verify-cli-input.mjs');
const contractBytes = readFileSync(
  new URL('../docs/metaharness/2026-10-17/contract.json', import.meta.url)
);
const contract = JSON.parse(contractBytes);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceHash = (dir) => hash(readFileSync(join(dir, source)));
const rootHash = sourceHash(baseline),
  fixedHash = sourceHash(candidate);
assert.notEqual(rootHash, fixedHash);
assert.equal(
  hash(readFileSync(join(baseline, 'package-lock.json'))),
  hash(readFileSync(join(candidate, 'package-lock.json')))
);
const parentBytes = readFileSync(join(baseline, source), 'utf8');
const measurements = [];
let existingNames;
function run(dir, command, args) {
  const r = spawnSync(command, args, {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(r.signal, null, 'Signals/timeouts are not completed evaluations');
  assert.notEqual(r.status, null);
  return { command: [command, ...args], exit: r.status, stdout: r.stdout, stderr: r.stderr };
}
const compact = (r) => ({ ...r, stdout: r.stdout.slice(-8000), stderr: r.stderr.slice(-3000) });
async function evaluator(policy, suite) {
  const dir = policy.handler === rootHash ? baseline : candidate;
  assert.equal(sourceHash(dir), policy.handler);
  const native = run(dir, process.execPath, [
    '--import',
    join(candidate, 'node_modules/tsx/dist/loader.mjs'),
    fixture,
    dir,
  ]);
  assert([0, 1].includes(native.exit));
  const http = JSON.parse(native.stdout.split('\n').find((l) => l.startsWith('{"holdout"')));
  assert.equal(http.holdout.length, 7);
  assert.equal(http.anchor.length, 4);
  const commands = [compact(native)];
  let itemWins,
    detail = { http };
  if (suite.id === 'holdout') {
    itemWins = http.holdout.map((x) => x.pass);
  } else {
    const report = join(dir, '.metaharness-unit-result.json');
    const tests = run(dir, 'npm', ['test', '--', '--reporter=json', `--outputFile=${report}`]);
    const assertions = JSON.parse(readFileSync(report)).testResults.flatMap(
      (x) => x.assertionResults
    );
    const passedNames = assertions
      .filter((x) => x.status === 'passed')
      .map((x) => x.fullName)
      .sort();
    const nonPassed = assertions.filter((x) => x.status !== 'passed');
    if (dir === baseline) {
      assert.equal(passedNames.length, 1070);
      assert.equal(nonPassed.length, 0);
      existingNames = passedNames;
    }
    assert(existingNames);
    const build = run(dir, 'npm', ['run', 'build']);
    itemWins = [
      ...http.anchor.map((x) => x.pass),
      tests.exit === 0 &&
        nonPassed.length === 0 &&
        existingNames.every((n) => passedNames.includes(n)),
      build.exit === 0,
    ];
    commands.push(compact(tests), compact(build));
    detail = {
      http,
      passed: passedNames.length,
      nonPassed: nonPassed.length,
      retainedExistingNames: existingNames.every((n) => passedNames.includes(n)),
      existingNamesSha256: hash(JSON.stringify(existingNames)),
    };
  }
  const primary = itemWins.filter(Boolean).length / itemWins.length;
  const score = {
    primary,
    noopRate: 1 - primary,
    costPerWin: 0,
    regressed: suite.id === 'anchor' && itemWins.some((x) => !x),
    itemWins,
  };
  measurements.push({ source: policy.handler, suite: suite.id, score, detail, commands });
  assert.equal(sourceHash(dir), policy.handler);
  return score;
}
const fingerprint = fw.gateFingerprint(fw.meetsPromotionRule);
const result = await fw.runFlywheelGenerations({
  rootPolicy: { handler: rootHash },
  proposer: async () => ({
    value: fixedHash,
    summary: 'Typed validation classification, safe JSON metadata, HTTP400 for CLI schema failures',
    inverse: { path: source, parentBytes, hash: hash(parentBytes) },
  }),
  evaluator,
  holdout: { id: 'holdout', items: contract.holdout },
  anchor: { id: 'anchor', items: contract.anchor },
  maxGenerations: 1,
  signer: fw.makeSigner(),
  promotionRule: fw.meetsPromotionRule,
  dataSource: 'LIVE_CLI_EDGE_HANDLER_LOOPBACK_HTTP_AND_REPOSITORY_TEST_BUILD',
});
const replay = fw.verifyReplayBundle(result.replayBundle, { pinnedGateFingerprint: fingerprint });
assert.equal(replay.pass, true);
assert.equal(result.promotions.length, 1);
writeFileSync(
  output,
  JSON.stringify(
    {
      contract,
      contractSha256: hash(contractBytes),
      source,
      baselineSource: rootHash,
      candidateSource: fixedHash,
      fixtureSha256: hash(readFileSync(fixture)),
      measurements,
      promotions: result.promotions.length,
      fingerprint,
      replay,
      replayBundle: result.replayBundle,
      boundary:
        'Component request validation only. No live RuVector delivery, IAM, Cloud Run startup, latency, cost or energy claim. Existing default in-memory decision-emitter behavior is unchanged; global lint/type/format/coverage/security and Rust remain independent gates.',
    },
    null,
    2
  ) + '\n'
);
console.log(
  JSON.stringify({
    promotions: result.promotions.length,
    replay,
    measurements: measurements.map((m) => ({
      suite: m.suite,
      primary: m.score.primary,
      passed: m.detail.passed,
      anchor: m.detail.http.anchor.filter((x) => x.pass).length,
    })),
  })
);
