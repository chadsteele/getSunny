import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import { createServer } from 'vite';
import syncAnonymous from '../netlify/functions/sync-anonymous.mjs';

test('uploads legacy and changed conversations with a persistent separate credential', async () => {
  const values = new Map([
    ['sunny-chat-thread', JSON.stringify([{ id: 0, role: 'user', content: 'legacy' }])],
    [
      'sunny-session-reports',
      JSON.stringify([{ path: '/first', report: { summary: 'legacy report' } }]),
    ],
  ]);
  const previous = {
    localStorage: globalThis.localStorage,
    window: globalThis.window,
    navigator: globalThis.navigator,
    fetch: globalThis.fetch,
    crypto: globalThis.crypto,
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks: { request: async (_key, callback) => callback() } },
  });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  const requests = [];
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  });
  let stopSync;
  try {
    const sync = await server.ssrLoadModule('/src/lib/anonymous-sync.ts');
    globalThis.fetch = async (_url, options) => {
      requests.push(options);
      if (requests.length === 1) return new Response(null, { status: 503 });
      return Response.json({ ok: true });
    };
    const errors = [];
    stopSync = sync.startAnonymousSync((error) => errors.push(error));
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(requests.length, 1);
    assert.match(errors[0], /remains on this device/);
    const first = JSON.parse(requests[0].body);
    assert.equal(first.sessions[0].messages[0].content, 'legacy');
    assert.equal(first.reports[0].report.summary, 'legacy report');
    assert.match(requests[0].headers.authorization, /^Bearer [0-9a-f]{64}$/);
    assert.notEqual(requests[0].headers.authorization.slice(7), first.initialUid);
    stopSync();
    stopSync = sync.startAnonymousSync((error) => errors.push(error));
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(requests.length, 2);
    assert.equal(requests[1].headers.authorization, requests[0].headers.authorization);
    assert.equal(errors.at(-1), '');
    values.set('sunny-chat-thread', JSON.stringify([{ id: 0, role: 'user', content: 'changed' }]));
    sync.scheduleAnonymousSync();
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(JSON.parse(requests[2].body).sessions[0].messages[0].content, 'changed');
  } finally {
    stopSync?.();
    await server.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
  }
});

test('server uses a hashed credential and rejects unauthenticated or malformed requests', async () => {
  const previousFetch = globalThis.fetch;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  let payload;
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return Response.json(true);
  };
  const token = 'a'.repeat(64);
  const body = {
    initialUid: '420f8a4b-b374-4e51-8507-25702bf868da',
    sessions: [{ path: '/first', messages: [{ id: 0, role: 'user', content: 'hello' }] }],
    reports: [],
  };
  const request = (authorization, data = body) =>
    new Request('https://example.invalid', {
      method: 'POST',
      headers: { authorization },
      body: JSON.stringify(data),
    });
  try {
    assert.equal((await syncAnonymous(request(''))).status, 400);
    assert.equal((await syncAnonymous(request(`Bearer ${token}`))).status, 200);
    assert.equal(payload.p_credential_hash, createHash('sha256').update(token).digest('hex'));
    assert.equal(JSON.stringify(payload).includes(token), false);
    assert.equal(
      (await syncAnonymous(request(`Bearer ${token}`, { ...body, sessions: [{}] }))).status,
      400,
    );
    globalThis.fetch = async () => Response.json(false);
    assert.equal((await syncAnonymous(request(`Bearer ${token}`))).status, 403);
  } finally {
    globalThis.fetch = previousFetch;
    if (url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = url;
    if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }
});
