import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let json;
let chat;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });
  json = await server.ssrLoadModule('/src/lib/llm-json.ts');
  chat = await server.ssrLoadModule('/src/lib/chat-stream.ts');
});

after(async () => {
  await server?.close();
});

test('streams only decoded spoken text, including split escapes and Unicode', () => {
  const raw = '{"text":"Hello \\"friend\\". \\uD83D\\uDE00 Next?","ask":"Next?","mute_mic":true}';
  const stream = json.createSpokenJsonStream();
  let spoken = '';
  let beforeEnd = '';
  for (const [index, character] of [...raw].entries()) {
    spoken += stream.append(character);
    if (index === raw.indexOf(',"ask"')) beforeEnd = spoken;
  }
  const { result, remaining } = stream.finish();
  spoken += remaining;
  assert.equal(spoken, 'Hello "friend". 😀 Next?');
  assert.equal(beforeEnd, spoken);
  assert.equal(result.ask, 'Next?');
  assert.equal(result.mute_mic, true);
});

test('streams with different field order and rejects malformed or inconsistent replies', () => {
  const stream = json.createSpokenJsonStream();
  assert.equal(stream.append('{"ask":"Go?","metadata":{"text":"Not spoken"},"text":"Go?'), 'Go?');
  assert.equal(stream.append('"}'), '');
  assert.equal(stream.finish().remaining, '');
  for (const raw of ['not JSON', '{"text":""}', '{"text":"hi","ask":5}', '{"text":"hi"']) {
    assert.throws(() => json.parseSpokenJson(raw), /language model response/i);
  }
  const duplicate = json.createSpokenJsonStream();
  duplicate.append('{"text":"first","text":"second"}');
  assert.throws(() => duplicate.finish(), /does not match/);
});

test('logs JSON request and raw streamed response', async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = globalThis.console.log;
  const logs = [];
  let request;
  globalThis.console.log = (...args) => logs.push(args);
  globalThis.fetch = async (url, options) => {
    request = { url, body: JSON.parse(options.body) };
    return new Response(
      `${JSON.stringify({ type: 'text', text: '{"text":"Hello"}' })}\n` +
        `${JSON.stringify({ type: 'usage', usage: { prompt_tokens: 2, completion_tokens: 1 } })}\n`,
    );
  };
  try {
    const payload = { systemPrompt: 'JSON', history: [], prompt: '{"text":"Hi"}' };
    const response = await chat.requestChatStream(payload);
    let text = '';
    await chat.readChatStream(
      response,
      (chunk) => (text += chunk),
      () => {},
    );
    assert.equal(request.url, '/.netlify/functions/chat-stream');
    assert.deepEqual(request.body, payload);
    assert.equal(text, '{"text":"Hello"}');
    const outgoing = logs.find((args) => args[1] === '[Sunny] LLM request:');
    const incoming = logs.find((args) => args[1] === '[Sunny] LLM response:');
    assert.deepEqual(JSON.parse(outgoing[2]), payload);
    assert.deepEqual(JSON.parse(incoming[2]), { raw: text });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.console.log = originalLog;
  }
});
