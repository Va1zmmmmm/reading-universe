import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEB = path.join(REPO, 'web');
const FIXES = path.join(REPO, 'tests', 'fixes');

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(FIXES, script), ...args], {
    cwd: REPO, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, `${script} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result.stdout;
}

test('generation lock permits only one concurrent run and releases after success/failure/cancel', () => {
  const concurrent = run('test-generation-lock.mjs', [path.join(WEB, 'app.mjs'), 'concurrent', '--expect-posts', '1']);
  assert.match(concurrent, /PASS: concurrent/);
  run('test-generation-lock.mjs', [path.join(WEB, 'app.mjs'), 'failure-recovery']);
  run('test-generation-lock.mjs', [path.join(WEB, 'app.mjs'), 'cancel-recovery']);
});

test('unchecked material remains saved history but is still rejected for AI requests', () => {
  const output = run('test-save-conflict.mjs', [WEB, 'accept']);
  assert.match(output, /PASS/);
});

test('empty universe and all-comet small libraries render without throwing', () => {
  const output = run('test-universe-empty.mjs', [WEB, 'patched']);
  assert.match(output, /PASS/);
});
