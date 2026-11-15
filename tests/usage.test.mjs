import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let api;
let readChatStream;
let createChatThreadStore;
let storage;

before(async () => {
  storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  api = await server.ssrLoadModule('/src/lib/usage.ts');
  ({ readChatStream } = await server.ssrLoadModule('/src/lib/chat-stream.ts'));
  ({ createChatThreadStore } = await server.ssrLoadModule('/src/lib/chat-thread-store.svelte.ts'));
});

after(async () => {
  await server?.close();
  delete globalThis.localStorage;
});

test('calculates provider usage and indicates unknown costs', () => {
  const llm = api.llmUsage(1000, 500);
  const stt = api.sttUsage(60);
  const tts = api.ttsUsage('hello world', 100);
  assert.equal(llm.estimatedCostUsd, 0.0036);
  assert.equal(stt.estimatedCostUsd, 0.0043);
  assert.equal(stt.inputTokens, null);
  assert.equal(tts.estimatedTokens, true);
  assert.equal(tts.inputTokens, 28);
  assert.equal(tts.outputTokens, 16);
  const summary = api.summarizeUsage([llm, stt, tts, api.unknownUsage('llm')]);
  assert.equal(summary.requests, 4);
  assert.equal(summary.unknownCosts, 1);
  assert.equal(summary.unknownTokenRequests, 1);
  assert.ok(
    Math.abs(
      summary.estimatedCostUsd -
        (llm.estimatedCostUsd + stt.estimatedCostUsd + tts.estimatedCostUsd),
    ) < 1e-12,
  );
  assert.throws(() => api.llmUsage(-1, 0));
  assert.throws(() => api.sttUsage(NaN));
});

test('stream parses fragmented text and usage without mixing metadata into text', async () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(
    '{"type":"text","text":"Hé"}\n{"type":"text","text":"llo"}\n{"type":"usage","usage":{"prompt_tokens":12,"completion_tokens":3}}\n',
  );
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
      controller.close();
    },
  });
  let text = '';
  const records = [];
  await readChatStream(
    new Response(body),
    (part) => (text += part),
    (usage) => records.push(usage),
  );
  assert.equal(text, 'Héllo');
  assert.equal(records.length, 1);
  assert.equal(records[0].inputTokens, 12);
  assert.equal(records[0].outputTokens, 3);
});

test('stream rejects invalid events and leaves missing usage unknown', async () => {
  const records = [];
  await readChatStream(
    new Response('{"type":"text","text":"ok"}\n'),
    () => {},
    (usage) => records.push(usage),
  );
  assert.deepEqual(records, []);
  await assert.rejects(
    readChatStream(
      new Response('{"type":"usage","usage":{}}\n'),
      () => {},
      () => {},
    ),
    /Invalid chat stream event/,
  );
  await assert.rejects(
    readChatStream(
      new Response('not json\n'),
      () => {},
      () => {},
    ),
  );
});

test('usage survives restart, deletion, and reload while preserving message grouping', () => {
  const store = createChatThreadStore('usage-test');
  const message = store.add('assistant', 'Hello', 'group');
  const pending = store.addUsage(api.unknownUsage('tts'), 'group');
  store.clear();
  store.updateUsage(pending, api.ttsUsage('Hello', 100));
  store.addUsage(api.sttUsage(12), 'empty-recording');
  const restored = createChatThreadStore('usage-test');
  restored.restore(true);
  assert.equal(restored.usageRecords.length, 2);
  assert.equal(restored.usageForGroup('group')[0].service, 'tts');
  assert.equal(
    restored.messages.some((item) => item.id === message),
    false,
  );
  assert.equal(api.summarizeUsage(restored.usageRecords).requests, 2);
});
