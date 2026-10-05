import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function run(status, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mailchannels-action-'));
  try {
    const preload = join(dir, 'mock.mjs');
    const output = join(dir, 'output');
    writeFileSync(output, '');
    writeFileSync(preload, `globalThis.fetch = async () => new Response('private response', {status: ${status}});`);
    const result = spawnSync(process.execPath, ['--import', preload, fileURLToPath(new URL('./index.js', import.meta.url))], {
      encoding: 'utf8', env: {
        ...process.env, INPUT_FROM: 'sender@example.com', INPUT_TO: 'recipient@example.com',
        INPUT_SUBJECT: 'private subject', INPUT_TEXT: 'private message', INPUT_HTML: '',
        'INPUT_API-KEY': 'fake%secret', 'INPUT_DRY-RUN': 'false', 'INPUT_TIMEOUT-SECONDS': '30',
        GITHUB_OUTPUT: output, ...extra,
      },
    });
    return { ...result, output: readFileSync(output, 'utf8') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('entrypoint masks credentials and writes GitHub outputs', () => {
  const result = run(202);
  assert.equal(result.status, 0);
  assert.equal(result.output, 'status=accepted\nhttp-status=202\n');
  assert.match(result.stdout, /::add-mask::fake%25secret/);
  assert.doesNotMatch(result.stdout + result.stderr, /private subject|private message|private response/);
});

test('entrypoint fails without success outputs on API failure', () => {
  const result = run(401);
  assert.equal(result.status, 1);
  assert.equal(result.output, '');
  assert.match(result.stderr, /::error::MailChannels returned HTTP 401/);
  assert.doesNotMatch(result.stderr, /fake|private/);
});

test('entrypoint reports dry-run outputs', () => {
  const result = run(200, { 'INPUT_DRY-RUN': 'true' });
  assert.equal(result.status, 0);
  assert.equal(result.output, 'status=validated\nhttp-status=200\n');
});

test('output write failure preserves acceptance warning without exposing filesystem paths', () => {
  const result = run(202, { GITHUB_OUTPUT: '/nonexistent/private-path/output' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /accepted the message, but writing action outputs failed/);
  assert.doesNotMatch(result.stderr, /private-path/);
});
