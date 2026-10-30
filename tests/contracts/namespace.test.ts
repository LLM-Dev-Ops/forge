import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const child = spawnSync(
  process.execPath,
  ['--import', 'tsx', 'tests/service/verify-contract-exports.mjs', '.'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 20_000,
  }
);
if (child.error || child.signal || !child.stdout.trim())
  throw new Error(child.error?.message || child.stderr || 'Native contract probe failed');
const report = JSON.parse(child.stdout) as {
  holdout: Array<{ name: string; passed: boolean; error?: string }>;
  anchors: Array<{ name: string; passed: boolean; error?: string }>;
};
if (report.holdout.length !== 4 || report.anchors.length !== 6)
  throw new Error('Frozen contract case drift');
describe('Public agent contract exports (native Node/tsx)', () => {
  for (const result of [...report.holdout, ...report.anchors]) {
    it(result.name, () => expect(result.passed, result.error).toBe(true));
  }
});
