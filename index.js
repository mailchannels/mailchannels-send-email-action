import { appendFileSync } from 'node:fs';
import { send } from './send.js';

function escapeCommand(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

const names = ['api-key', 'from', 'to', 'subject', 'text', 'html', 'dry-run', 'timeout-seconds'];
const inputs = Object.fromEntries(names.map(name => [name, process.env[`INPUT_${name.toUpperCase()}`]]));
if (inputs['api-key']) console.log(`::add-mask::${escapeCommand(inputs['api-key'])}`);

try {
  const result = await send(inputs);
  if (process.env.GITHUB_OUTPUT) {
    try {
      appendFileSync(process.env.GITHUB_OUTPUT, `status=${result.status}\nhttp-status=${result.httpStatus}\n`);
    } catch {
      throw new Error(`MailChannels ${result.status} the message, but writing action outputs failed. Do not retry a send solely to recover outputs.`);
    }
  }
  console.log(result.status === 'validated'
    ? 'MailChannels validated the message without sending it.'
    : 'MailChannels accepted the message. Delivery is not yet confirmed.');
} catch (error) {
  console.error(`::error::${escapeCommand(error.message)}`);
  process.exitCode = 1;
}
