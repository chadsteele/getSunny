import assert from 'node:assert/strict';
import { access, readdir } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let steps;
let condition;
let selectSession;
let availableSessionPaths;
let sessionContext;
let openingPrompt;

before(async () => {
  server = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
  });
  steps = (await server.ssrLoadModule('/src/lib/sessions/outline.ts')).default;
  condition = (await server.ssrLoadModule('/src/lib/session-manager/condition.ts'))
    .startsAtLeast18HoursAfterPreviousSession;
  ({ selectSession, availableSessionPaths } = await server.ssrLoadModule(
    '/src/lib/session-manager/select-session.ts',
  ));
  ({ sessionContext, openingPrompt } = await server.ssrLoadModule('/src/lib/session-context.ts'));
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
    assert.ok([step.prompt, step.role, step.process, step.rules].some((text) => text?.trim()));
    assert.ok(step.intro.trim());
    assert.ok(step.intro.toLowerCase().includes(step.name.toLowerCase()));
    assert.equal(step.condition, condition);
    assert.equal('order' in step, false);
  }
  for (const file of expectedFiles) await access(new URL(file, directory));
  const files = await readdir(directory, { recursive: true });
  const definitions = files.filter(
    (file) => file.endsWith('.ts') && file.includes('/') && !file.endsWith('/base.ts'),
  );
  assert.deepEqual(definitions.sort(), expectedFiles.sort());
});

test('opening includes remaining session fields, including new fields, without repeating context', () => {
  const session = {
    ...steps[0],
    futureDetails: { instructions: ['first', 'second'], enabled: true },
    extraCondition: undefined,
  };
  const context = sessionContext(session, undefined);
  const payload = JSON.parse(openingPrompt(session, 'Opening script', context));
  assert.equal(payload.opening, 'Opening script');
  assert.deepEqual(payload.context, context);
  for (const [key, value] of Object.entries(session)) {
    if (key !== 'condition' && !Object.hasOwn(context.session, key) && value !== undefined) {
      assert.deepEqual(payload.sessionDetails[key], value);
    } else {
      assert.equal(Object.hasOwn(payload.sessionDetails, key), false);
    }
  }
  const extendedContext = {
    ...context,
    session: { ...context.session, futureDetails: session.futureDetails },
  };
  assert.equal(
    Object.hasOwn(
      JSON.parse(openingPrompt(session, 'Opening script', extendedContext)).sessionDetails,
      'futureDetails',
    ),
    false,
  );
  assert.throws(
    () => openingPrompt({ ...session, futureDetails: { invalid: () => {} } }, 'Opening', context),
    /non-JSON value/,
  );
});

test('sessions inherit the common values for their step and phase', async () => {
  const root = (await server.ssrLoadModule('/src/lib/sessions/base.ts')).default;
  assert.equal(root.condition, condition);
  for (const session of steps) {
    const stepPath = session.step.toLowerCase();
    const phasePath = session.phase.toLowerCase();
    const stepBase = (await server.ssrLoadModule(`/src/lib/sessions/${stepPath}/base.ts`)).default;
    const phaseBase = (
      await server.ssrLoadModule(`/src/lib/sessions/${stepPath}/${phasePath}/base.ts`)
    ).default;
    assert.equal(stepBase.condition, root.condition);
    assert.equal(stepBase.step, session.step);
    assert.equal(phaseBase.condition, stepBase.condition);
    assert.equal(phaseBase.step, stepBase.step);
    assert.equal(phaseBase.phase, session.phase);
    assert.equal(phaseBase.tagline, session.tagline);
    assert.equal(session.condition, phaseBase.condition);
  }
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

test('only enables reached sessions and the next session after the 18-hour wait', () => {
  const end = '2026-01-01T10:00:00Z';
  const completed = new Map([[steps[0].path, end]]);
  const available = (
    now,
    started = [],
    selected = steps[0].path,
    reports = completed,
    host = 'sunny.example',
  ) => availableSessionPaths(steps, started, selected, reports, new Date(now), host);
  assert.deepEqual(available('2026-01-02T03:59:59.999Z'), [steps[0].path]);
  assert.deepEqual(available('2026-01-02T04:00:00.000Z'), [steps[0].path, steps[1].path]);
  const twoCompleted = new Map([
    [steps[0].path, end],
    [steps[1].path, '2026-01-02T10:00:00Z'],
  ]);
  assert.deepEqual(available('2026-01-03T03:59:59.999Z', [], steps[0].path, twoCompleted), [
    steps[0].path,
    steps[1].path,
  ]);
  assert.deepEqual(
    available('2026-01-03T04:00:00.000Z', [], steps[0].path, twoCompleted),
    steps.slice(0, 3).map((session) => session.path),
  );
  assert.deepEqual(available('2026-01-03T00:00:00Z', [], steps[0].path, new Map()), [
    steps[0].path,
  ]);
  assert.deepEqual(
    available('2026-01-03T00:00:00Z', [steps[2].path], steps[0].path, new Map()),
    steps.slice(0, 3).map((session) => session.path),
  );
  assert.deepEqual(
    available('2026-01-03T00:00:00Z', [], steps[2].path, new Map()),
    steps.slice(0, 3).map((session) => session.path),
  );
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(
      available('2026-01-01T10:00:00Z', [], steps[0].path, new Map(), host).length,
      steps.length,
    );
  }
  assert.equal(
    available('2026-01-01T10:00:00Z', [], steps[0].path, new Map(), 'localhost.example').length,
    1,
  );
  assert.throws(() => available('2026-01-03T00:00:00Z', [], '/missing'), /not in the outline/);
});
