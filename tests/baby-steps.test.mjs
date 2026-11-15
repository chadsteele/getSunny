import assert from 'node:assert/strict';
import { access, readdir } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let steps;
let condition;
let selectSession;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });
  steps = (await server.ssrLoadModule('/src/lib/sessions/outline.ts')).default;
  condition = (await server.ssrLoadModule('/src/lib/session-manager/condition.ts'))
    .startsAtLeast18HoursAfterPreviousSession;
  selectSession = (await server.ssrLoadModule('/src/lib/session-manager/select-session.ts'))
    .selectSession;
});

after(async () => {
  await server?.close();
});

test('outline exports every baby step with a matching file and a distinct prompt', async () => {
  assert.equal(steps.length, 35);
  const directory = new URL('../src/lib/sessions/', import.meta.url);
  const expectedFiles = steps.map(
    ({ step, phase, path }) =>
      `${step.toLowerCase()}/${phase.toLowerCase()}/${path.split('/').at(-1).toLowerCase()}.ts`,
  );
  assert.equal(new Set(expectedFiles).size, 35);
  assert.equal(new Set(steps.map(({ prompt }) => prompt)).size, 35);
  for (const step of steps) {
    assert.ok(step.prompt.trim());
    assert.ok(step.intro.trim());
    assert.ok(step.intro.toLowerCase().includes(step.name.toLowerCase()));
    assert.equal(step.condition, condition);
    assert.equal('order' in step, false);
  }
  for (const file of expectedFiles) await access(new URL(file, directory));
  const files = await readdir(directory, { recursive: true });
  const definitions = files.filter((file) => file.endsWith('.ts') && file.includes('/'));
  assert.deepEqual(definitions.sort(), expectedFiles.sort());
});

test('requires a full 18 hours after the prior session ends', () => {
  const previousSessionEnd = new Date('2026-01-01T10:00:00Z');
  const allows = (sessionStart) => condition({ sessionStart, previousSessionEnd });
  assert.equal(allows(new Date('2026-01-01T09:00:00Z')), false);
  assert.equal(allows(new Date('2026-01-02T03:59:59.999Z')), false);
  assert.equal(allows(new Date('2026-01-02T04:00:00Z')), true);
  assert.equal(allows(new Date('2026-01-02T04:00:00.001Z')), true);
});

test('allows the first session and rejects invalid dates', () => {
  const valid = new Date('2026-01-01T10:00:00Z');
  const invalid = new Date('invalid');
  assert.equal(condition({ sessionStart: valid, previousSessionEnd: null }), true);
  assert.throws(() => condition({ sessionStart: invalid, previousSessionEnd: null }), RangeError);
  assert.throws(() => condition({ sessionStart: valid, previousSessionEnd: invalid }), RangeError);
});

test('selects sessions in outline order after completion and the waiting period', () => {
  const now = new Date('2026-01-02T04:00:00Z');
  const completedAt = '2026-01-01T10:00:00Z';
  assert.deepEqual(selectSession(steps, [], now), {
    kind: 'session',
    session: steps[0],
    isNew: true,
  });
  assert.deepEqual(selectSession(steps, [{ path: steps[0].path, completedAt: null }], now), {
    kind: 'session',
    session: steps[0],
    isNew: false,
  });
  assert.equal(
    selectSession(steps, [{ path: steps[0].path, completedAt }], new Date(now.getTime() - 1))
      .session,
    steps[0],
  );
  assert.deepEqual(selectSession(steps, [{ path: steps[0].path, completedAt }], now), {
    kind: 'session',
    session: steps[1],
    isNew: true,
  });
  assert.deepEqual(selectSession(steps, [{ path: steps.at(-1).path, completedAt }], now), {
    kind: 'complete',
  });
  assert.throws(() => selectSession(steps, [{ path: '/unknown', completedAt }], now));
  assert.throws(() => selectSession(steps, [{ path: steps[0].path, completedAt: 'bad' }], now));
});
