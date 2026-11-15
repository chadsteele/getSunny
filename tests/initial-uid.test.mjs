import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { webcrypto } from 'node:crypto';
import { createServer } from 'vite';
import saveProfile from '../netlify/functions/save-profile.mjs';

let server;
let api;
let storage;

before(async () => {
  storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };
  if (!globalThis.crypto) globalThis.crypto = webcrypto;
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  api = await server.ssrLoadModule('/src/lib/initial-uid.ts');
});

after(async () => {
  await server?.close();
  delete globalThis.localStorage;
});

test('creates a persistent browser identifier and associates multiple verified accounts locally', () => {
  storage.clear();
  const id = api.getInitialUid();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(api.getInitialUid(), id);
  api.associateInitialUid('user-a');
  api.associateInitialUid('user-b');
  assert.deepEqual(JSON.parse(storage.get('sunny-initial-uid-accounts')), {
    'user-a': id,
    'user-b': id,
  });
  storage.set('sunny-initial-uid', 'not-an-id');
  assert.throws(() => api.getInitialUid(), /invalid/);
  assert.equal(storage.get('sunny-initial-uid'), 'not-an-id');
});

test('only associates the browser with the server-verified Stytch user', async () => {
  const originalFetch = globalThis.fetch;
  const vars = ['STYTCH_PROJECT_ID', 'STYTCH_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const originalEnv = Object.fromEntries(vars.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    STYTCH_PROJECT_ID: 'test-project',
    STYTCH_SECRET: 'test-secret',
    SUPABASE_URL: 'https://example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  });
  const calls = [];
  let rejectAuthentication = false;
  let rejectAssociation = false;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/sessions/authenticate')) {
      return rejectAuthentication
        ? new Response(null, { status: 401 })
        : Response.json({ user_id: 'verified-user' });
    }
    if (url.includes('sunny_browser_associations') && rejectAssociation) {
      return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 201 });
  };
  try {
    const id = '420f8a4b-b374-4e51-8507-25702bf868da';
    const response = await saveProfile(
      new Request('https://example.invalid', {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ firstName: 'Sam', initialUid: id, userId: 'untrusted-user' }),
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(calls.length, 3);
    assert.deepEqual(JSON.parse(calls[2].options.body), [
      { initial_uid: id, user_id: 'verified-user' },
    ]);
    assert.match(calls[2].options.headers.prefer, /ignore-duplicates/);

    calls.length = 0;
    const invalid = await saveProfile(
      new Request('https://example.invalid', {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ firstName: 'Sam', initialUid: 'not-an-id' }),
      }),
    );
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 0);

    rejectAuthentication = true;
    const request = () =>
      new Request('https://example.invalid', {
        method: 'POST',
        headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
        body: JSON.stringify({ firstName: 'Sam', initialUid: id }),
      });
    const unauthorized = await saveProfile(request());
    assert.equal(unauthorized.status, 401);
    assert.equal(calls.length, 1);
    calls.length = 0;
    rejectAuthentication = false;
    rejectAssociation = true;
    const failure = await saveProfile(request());
    assert.equal(failure.status, 502);
    assert.match((await failure.json()).error, /associate this browser/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of vars) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
});
