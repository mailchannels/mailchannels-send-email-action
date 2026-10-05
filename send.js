const ENDPOINT = 'https://api.mailchannels.net/tx/v1/send';

function required(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing required input: ${name}.`);
  return value.trim();
}

function address(value, name) {
  const email = required(value, name);
  if (!/^[^\s@<>,\x00-\x1f\x7f]+@[^\s@<>,\x00-\x1f\x7f]+$/.test(email)) {
    throw new Error(`${name} must contain bare email addresses without display names or control characters.`);
  }
  return { email };
}

export function buildRequest(inputs) {
  const apiKey = required(inputs['api-key'], 'api-key');
  if (/[\x00-\x20\x7f]/.test(apiKey)) throw new Error('API key contains invalid whitespace or control characters.');
  const dryRunValue = (inputs['dry-run'] ?? 'false').trim().toLowerCase();
  if (!['true', 'false'].includes(dryRunValue)) throw new Error('dry-run must be true or false.');
  const dryRun = dryRunValue === 'true';
  const timeoutText = (inputs['timeout-seconds'] ?? '30').trim();
  const timeout = Number(timeoutText);
  if (!/^\d+$/.test(timeoutText) || timeout < 1 || timeout > 120) {
    throw new Error('timeout-seconds must be an integer from 1 to 120.');
  }
  const subject = required(inputs.subject, 'subject');
  if (/[\x00-\x1f\x7f]/.test(subject)) throw new Error('Subject must not contain control characters.');
  const recipients = required(inputs.to, 'to').split(',').map(value => address(value, 'to'));
  const content = [];
  if (inputs.text?.trim()) content.push({ type: 'text/plain', value: inputs.text });
  if (inputs.html?.trim()) content.push({ type: 'text/html', value: inputs.html });
  if (!content.length) throw new Error('Provide at least one non-empty text or html body.');
  return {
    url: ENDPOINT + (dryRun ? '?dry-run=true' : ''),
    apiKey,
    timeout,
    dryRun,
    body: {
      personalizations: [{ to: recipients }],
      from: address(inputs.from, 'from'),
      subject,
      content,
    },
  };
}

export async function send(inputs, fetchImpl = fetch) {
  const request = buildRequest(inputs);
  let response;
  try {
    response = await fetchImpl(request.url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': request.apiKey },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(request.timeout * 1000),
    });
  } catch {
    throw new Error('MailChannels request failed or timed out. The outcome may be unknown; check delivery activity before retrying.');
  }
  // Do not log or expose the response body: it can contain message content.
  if (response.body) await response.body.cancel().catch(() => {});
  const expected = request.dryRun ? 200 : 202;
  if (response.status !== expected) {
    const status = Number.isInteger(response.status) ? response.status : 'unknown';
    throw new Error(`MailChannels returned HTTP ${status}; expected ${expected}. No automatic retry was attempted.`);
  }
  return { status: request.dryRun ? 'validated' : 'accepted', httpStatus: expected };
}
