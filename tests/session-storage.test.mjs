import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let sessionStorageApi;
let outline;
let local;
let tab;

function storage(map) {
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

before(async () => {
  local = new Map();
  tab = new Map();
  globalThis.localStorage = storage(local);
  globalThis.sessionStorage = storage(tab);
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  sessionStorageApi = await server.ssrLoadModule('/src/lib/session-manager');
  outline = (await server.ssrLoadModule('/src/lib/sessions/outline.ts')).default;
});

after(async () => {
  await server?.close();
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
});

test('preserves legacy first-session chat and separates other sessions', () => {
  const { chatStorageKey, hasSessionHistory, currentSession } = sessionStorageApi;
  assert.equal(currentSession().path, outline[0].path);
  assert.equal(chatStorageKey(outline[0].path), 'sunny-chat-thread');
  local.set('sunny-chat-thread', JSON.stringify([{ id: 0, content: 'hello' }]));
  assert.equal(hasSessionHistory(outline[0]), true);
  assert.equal(hasSessionHistory(outline[1]), false);
  assert.notEqual(chatStorageKey(outline[0].path), chatStorageKey(outline[1].path));
});

test('selects and resumes sessions with explicit restart requests', () => {
  const {
    currentSession,
    selectSessionForChat,
    shouldRestartSession,
    clearRestartRequest,
    hasSessionHistory,
    chatStorageKey,
  } = sessionStorageApi;
  selectSessionForChat(outline[1], true);
  assert.equal(currentSession().path, outline[1].path);
  assert.equal(shouldRestartSession(outline[1].path), true);
  assert.equal(shouldRestartSession(outline[0].path), false);
  clearRestartRequest();
  assert.equal(shouldRestartSession(outline[1].path), false);
  local.set(chatStorageKey(outline[1].path), JSON.stringify([{ id: 0, deleted: true }]));
  assert.equal(hasSessionHistory(outline[1]), true);
  selectSessionForChat(outline[0], false);
  assert.equal(currentSession().path, outline[0].path);
});

test('rejects invalid stored history and unknown sessions', () => {
  const { currentSession, hasSessionHistory, chatStorageKey, selectSessionForChat } =
    sessionStorageApi;
  local.set(chatStorageKey(outline[2].path), '{}');
  assert.throws(() => hasSessionHistory(outline[2]), /invalid/);
  local.set('sunny-current-session', '/missing');
  assert.throws(() => currentSession(), /not in the outline/);
  assert.throws(() => selectSessionForChat({ ...outline[0], path: '/missing' }, false));
});

test('groups sessions in outline order and respects availability conditions', () => {
  const { groupSessions, isSessionEnabled } = sessionStorageApi;
  const grouped = groupSessions(outline);
  assert.deepEqual(
    grouped.map((step) => step.name),
    ['Assess', 'Create', 'Execution'],
  );
  assert.deepEqual(grouped[0].phases[0].sessions, outline.slice(0, 5));
  const unavailable = { ...outline[0], condition: () => false };
  assert.equal(isSessionEnabled(unavailable, [], new Date()), false);
  assert.equal(isSessionEnabled(unavailable, [unavailable.path], new Date()), true);
});

test('initializes chats for continue and restart while retaining deleted history', () => {
  const { chatStorageKey, createSessionChat, selectSessionForChat, shouldRestartSession } =
    sessionStorageApi;
  const key = chatStorageKey(outline[3].path);
  local.set(key, JSON.stringify([{ id: 0, role: 'user', content: 'saved' }]));
  selectSessionForChat(outline[3], false);
  const continuing = createSessionChat(outline[3].path);
  assert.equal(continuing.initialize(), false);
  assert.equal(continuing.chat.messages[0].content, 'saved');

  selectSessionForChat(outline[3], true);
  const restarting = createSessionChat(outline[3].path);
  assert.equal(restarting.initialize(), true);
  assert.deepEqual(restarting.chat.messages, []);
  assert.equal(JSON.parse(local.get(key))[0].deleted, true);
  assert.equal(shouldRestartSession(outline[3].path), false);
});

test('assembles session prompt sections and validates missing prompt text', async () => {
  const { sessionPrompts } = sessionStorageApi;
  const { prompt, role, process, objectives, rules } = outline[0];
  const parent = (await server.ssrLoadModule('/src/lib/sessions/assess/clarity/base.ts')).default;
  assert.ok(parent.prompt.trim());
  assert.equal(prompt, parent.prompt);
  assert.ok(role?.trim());
  assert.ok(process?.trim());
  assert.ok(objectives?.trim());
  assert.ok(rules?.trim());
  assert.deepEqual(sessionPrompts(outline[0]), {
    opening: outline[0].intro,
    prompt: `${prompt}\n\nRole:\n\n${role}\n\nProcess:\n\n${process}\n\nObjectives:\n\n${objectives}\n\nRules:\n\n${rules}`,
  });
  assert.ok(objectives.startsWith(parent.objectives));
  assert.match(sessionPrompts(outline[0]).prompt, /The dream — measurable and detailed/);

  for (const session of outline.slice(1)) {
    assert.equal(session.role, role);
    assert.ok(process.startsWith(session.process));
    assert.equal(session.rules, rules);
    assert.equal(
      sessionPrompts(session).prompt,
      `${session.prompt}\n\nRole:\n\n${role}\n\nProcess:\n\n${session.process}\n\nObjectives:\n\n${session.objectives}\n\nRules:\n\n${rules}`,
    );
  }
  assert.ok(!prompt.includes('undefined'));
  assert.equal(
    sessionPrompts({
      ...outline[1],
      role: undefined,
      process: undefined,
      objectives: undefined,
      rules: undefined,
      commands: 'Finish.',
    }).prompt,
    `${outline[1].prompt}\n\nCommands:\n\nFinish.`,
  );
  assert.equal(
    sessionPrompts({
      ...outline[1],
      role: undefined,
      process: undefined,
      objectives: undefined,
      rules: undefined,
    }).prompt,
    outline[1].prompt,
  );
  assert.throws(() => sessionPrompts({ ...outline[0], intro: ' ' }), /opening/);
  assert.throws(
    () =>
      sessionPrompts({
        ...outline[0],
        prompt: '',
        role: undefined,
        process: undefined,
        objectives: undefined,
        rules: undefined,
        commands: undefined,
      }),
    /system prompt/,
  );
  const intro =
    'Session Opening Script\n"Hello there"\nSession Closing (After Story Consolidation)';
  assert.equal(sessionPrompts({ ...outline[0], intro }).opening, 'Hello there');
});

test('usage-only history does not suppress the session introduction', () => {
  const { chatStorageKey, createSessionChat, selectSessionForChat } = sessionStorageApi;
  const session = outline[4];
  local.set(
    chatStorageKey(session.path),
    JSON.stringify([
      {
        id: 0,
        role: 'status',
        content: '',
        usageGroup: 'failed-intro',
        usage: {
          service: 'tts',
          model: 'gpt-4o-mini-tts',
          inputTokens: null,
          outputTokens: null,
          audioSeconds: null,
          estimatedTokens: true,
          estimatedCostUsd: null,
        },
      },
    ]),
  );
  selectSessionForChat(session, false);
  assert.equal(createSessionChat(session.path).initialize(), true);
});
