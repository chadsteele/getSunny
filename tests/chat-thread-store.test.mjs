import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let createChatThreadStore;
let storage;

before(async () => {
  storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ createChatThreadStore } = await server.ssrLoadModule('/src/lib/chat-thread-store.svelte.ts'));
});

after(async () => {
  await server?.close();
  delete globalThis.localStorage;
});

test('soft deletion retains messages without exposing them after restore', () => {
  const store = createChatThreadStore('chat-test');
  store.add('user', 'first');
  store.add('assistant', 'second');
  store.clear();
  assert.deepEqual(store.messages, []);
  const retained = JSON.parse(storage.get('chat-test'));
  assert.equal(retained.length, 2);
  assert.ok(retained.every((message) => message.deleted === true));
  store.add('user', 'third');
  assert.equal(store.messages[0].id, 2);
  const restored = createChatThreadStore('chat-test');
  restored.restore();
  assert.deepEqual(
    restored.messages.map((message) => message.content),
    ['third'],
  );
});

test('review truncation flags removed messages without exposing them', () => {
  const store = createChatThreadStore('review-test');
  store.add('user', 'first');
  const selected = store.add('assistant', 'second');
  store.add('user', 'third');
  store.removeMessagesBefore(selected);
  assert.deepEqual(
    store.messages.map((message) => message.content),
    ['first'],
  );
  const retained = JSON.parse(storage.get('review-test'));
  assert.equal(retained[0].deleted, undefined);
  assert.equal(retained[1].deleted, true);
  assert.equal(retained[2].deleted, true);
});

test('strict restore rejects malformed saved chats without overwriting them', () => {
  storage.set('bad-chat', '{}');
  const store = createChatThreadStore('bad-chat');
  assert.throws(() => store.restore(true), /not an array/);
  assert.equal(storage.get('bad-chat'), '{}');
});

test('clear retains visible messages when browser storage fails', () => {
  const store = createChatThreadStore('unavailable-chat');
  store.add('user', 'keep this message');
  const setItem = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => {
    throw new Error('Storage unavailable');
  };
  try {
    assert.throws(() => store.clear(), /Storage unavailable/);
    assert.equal(store.messages[0].content, 'keep this message');
  } finally {
    globalThis.localStorage.setItem = setItem;
  }
});
