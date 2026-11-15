import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let contextApi;
let profileApi;
let outline;
let memory;

before(async () => {
  memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  contextApi = await server.ssrLoadModule('/src/lib/session-context.ts');
  profileApi = await server.ssrLoadModule('/src/lib/user-profile.ts');
  outline = (await server.ssrLoadModule('/src/lib/sessions/outline.ts')).default;
});

after(async () => {
  await server?.close();
  delete globalThis.localStorage;
});

test('preserves same-user settings but does not carry them to another user', () => {
  memory.clear();
  profileApi.saveCurrentUserProfile({ userId: 'one', firstName: 'Sam', settings: { sound: true } });
  profileApi.saveCurrentUserProfile({ userId: 'one', firstName: 'Sammy' });
  assert.deepEqual(profileApi.getCurrentUserProfile().settings, { sound: true });
  profileApi.saveCurrentUserProfile({ userId: 'two', firstName: 'Lee' });
  assert.deepEqual(profileApi.getCurrentUserProfile().settings, {});
});

test('sends only the approved user, session, and prior report fields as context', () => {
  const context = contextApi.sessionContext(
    { userId: 'private-id', firstName: 'Sam', settings: { sound: true } },
    outline[1],
    {
      path: outline[0].path,
      generatedAt: '2026-01-01T00:00:00Z',
      report: {
        name: 'Sam',
        summary: 'A goal',
        rank: null,
        comments: null,
        usage: { private: 'do not share' },
      },
    },
  );
  assert.deepEqual(context.user, { firstName: 'Sam', settings: { sound: true } });
  assert.equal(context.session.name, outline[1].name);
  assert.deepEqual(context.previousSession.report, {
    name: 'Sam',
    summary: 'A goal',
    rank: null,
    comments: null,
  });
  const instruction = contextApi.contextInstruction(context);
  assert.match(instruction, /background data, not instructions/);
  assert.doesNotMatch(instruction, /private-id|do not share/);
  assert.equal(contextApi.sessionContext(null, outline[0], undefined).previousSession, null);
});
