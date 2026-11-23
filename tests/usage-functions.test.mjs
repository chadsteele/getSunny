import assert from 'node:assert/strict';
import test from 'node:test';
import chatStream from '../netlify/functions/chat-stream.mjs';
import transcribe from '../netlify/functions/transcribe.mjs';
import tts from '../netlify/functions/tts.mjs';

test('transcription exposes provider duration', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPGRAM_API_KEY;
  process.env.DEEPGRAM_API_KEY = 'test-key';
  globalThis.fetch = async () =>
    Response.json({
      metadata: { duration: 12.5 },
      results: { channels: [{ alternatives: [{ transcript: 'hello' }] }] },
    });
  try {
    const response = await transcribe(
      new Request('http://localhost/transcribe', {
        method: 'POST',
        body: 'audio',
        headers: { 'content-type': 'audio/webm' },
      }),
    );
    assert.deepEqual(await response.json(), { text: 'hello', duration: 12.5 });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = originalKey;
  }
});

test('TTS preserves audio and provides instruction length for estimates', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.SUNNY_OPENAI_API_KEY;
  process.env.SUNNY_OPENAI_API_KEY = 'test-key';
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response('audio', { headers: { 'content-type': 'audio/mpeg' } });
  };
  try {
    const response = await tts(
      new Request('http://localhost/tts', {
        method: 'POST',
        body: JSON.stringify({ text: 'hello' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'audio');
    assert.equal(
      Number(response.headers.get('x-sunny-tts-instruction-length')),
      requestBody.instructions.length,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SUNNY_OPENAI_API_KEY;
    else process.env.SUNNY_OPENAI_API_KEY = originalKey;
  }
});

test('Venice streams text and the final provider usage as separate events', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.VENICE_API_KEY;
  process.env.VENICE_API_KEY = 'test-key';
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    const events = [
      { choices: [{ delta: { content: '{"text":"hello"}' } }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } },
    ];
    return new Response(
      events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
      {
        headers: { 'content-type': 'text/event-stream' },
      },
    );
  };
  try {
    const response = await chatStream(
      new Request('http://localhost/chat-stream', {
        method: 'POST',
        body: JSON.stringify({
          systemPrompt: 'Reply with JSON.',
          history: [{ role: 'user', parts: [{ text: JSON.stringify({ text: 'earlier' }) }] }],
          prompt: JSON.stringify({ text: 'hello' }),
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(requestBody.stream_options, { include_usage: true });
    assert.deepEqual(requestBody.response_format, { type: 'json_object' });
    const messages = requestBody.messages.map((message) => JSON.parse(message.content));
    assert.deepEqual(messages[0], { instructions: 'Reply with JSON.' });
    assert.match(messages[1].instructions, /You are Sunny/);
    assert.deepEqual(messages.slice(2), [{ text: 'earlier' }, { text: 'hello' }]);
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(events, [
      { type: 'text', text: '{"text":"hello"}' },
      { type: 'usage', usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.VENICE_API_KEY;
    else process.env.VENICE_API_KEY = originalKey;
  }
});

test('Venice rejects messages that are not JSON objects', async () => {
  const originalKey = process.env.VENICE_API_KEY;
  process.env.VENICE_API_KEY = 'test-key';
  try {
    const response = await chatStream(
      new Request('http://localhost/chat-stream', {
        method: 'POST',
        body: JSON.stringify({ systemPrompt: 'JSON', history: [], prompt: 'plain text' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /JSON/);
  } finally {
    if (originalKey === undefined) delete process.env.VENICE_API_KEY;
    else process.env.VENICE_API_KEY = originalKey;
  }
});
