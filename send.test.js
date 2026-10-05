import { test } from 'node:test';
import assert from 'node:assert/strict';
import { send } from './send.js';

const valid = { 'api-key': 'test-secret', from: 'sender@example.com', to: 'one@example.com, two@example.com', subject: 'Déployed ✓', text: 'Hello\nworld', html: '<b>Hello ✓</b>' };

test('sends authenticated UTF-8 multipart content to the fixed API endpoint', async () => {
  let calls = 0;
  const result = await send(valid, async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.mailchannels.net/tx/v1/send');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json', 'X-Api-Key': 'test-secret' });
    assert.deepEqual(JSON.parse(options.body), {
      personalizations: [{ to: [{ email: 'one@example.com' }, { email: 'two@example.com' }] }],
      from: { email: 'sender@example.com' }, subject: 'Déployed ✓',
      content: [{ type: 'text/plain', value: 'Hello\nworld' }, { type: 'text/html', value: '<b>Hello ✓</b>' }],
    });
    return new Response('private response', { status: 202 });
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: 'accepted', httpStatus: 202 });
});

test('dry run uses validation endpoint and reports validated, not accepted', async () => {
  assert.deepEqual(await send({ ...valid, 'dry-run': 'true' }, async url => {
    assert.equal(url, 'https://api.mailchannels.net/tx/v1/send?dry-run=true');
    return new Response(null, { status: 200 });
  }), { status: 'validated', httpStatus: 200 });
});

test('rejects invalid inputs before network activity', async () => {
  const cases = [
    { 'api-key': '' }, { 'api-key': 'bad\nkey' }, { from: 'Display <sender@example.com>' },
    { to: 'one@example.com,' }, { to: 'invalid' }, { subject: '' }, { subject: 'header\ninjection' },
    { text: '', html: ' ' }, { 'dry-run': 'yes' }, { 'timeout-seconds': '0' },
    { 'timeout-seconds': '121' }, { 'timeout-seconds': '1.5' },
  ];
  for (const input of cases) {
    let calls = 0;
    await assert.rejects(send({ ...valid, ...input }, async () => { calls++; }));
    assert.equal(calls, 0);
  }
});

test('rejects unexpected HTTP codes, discards response bodies, and never retries', async () => {
  for (const status of [200, 301, 400, 401, 429, 500]) {
    let calls = 0;
    let cancelled = false;
    await assert.rejects(send(valid, async () => {
      calls++;
      return { status, body: { cancel: async () => { cancelled = true; } } };
    }), new RegExp(`HTTP ${status}; expected 202`));
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  }
  await assert.rejects(send({ ...valid, 'dry-run': 'true' }, async () => new Response(null, { status: 202 })), /expected 200/);
});

test('network errors do not expose underlying error content or retry', async () => {
  let calls = 0;
  await assert.rejects(send(valid, async () => { calls++; throw new Error('test-secret private body'); }), error => {
    assert.match(error.message, /outcome may be unknown/);
    assert.doesNotMatch(error.message, /test-secret|private body/);
    return true;
  });
  assert.equal(calls, 1);
});

test('request timeout aborts the fetch without retry', async () => {
  let calls = 0;
  // Keep the event loop alive because AbortSignal.timeout uses an unref timer.
  const keepAlive = setInterval(() => {}, 2000);
  try {
    await assert.rejects(send({ ...valid, 'timeout-seconds': '1' }, async (_, { signal }) => {
      calls++;
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }), /timed out/);
    assert.equal(calls, 1);
  } finally { clearInterval(keepAlive); }
});
