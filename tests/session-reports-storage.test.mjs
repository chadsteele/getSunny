import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createServer } from 'vite';

let server;
let manager;
let outline;
let memory;

before(async () => {
  memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  manager = await server.ssrLoadModule('/src/lib/session-manager');
  outline = (await server.ssrLoadModule('/src/lib/sessions/outline.ts')).default;
});

after(async () => {
  await server?.close();
  delete globalThis.localStorage;
});

function report(summary, lastTimestamp = null) {
  return {
    name: null,
    summary,
    rank: null,
    comments: null,
    firstTimestamp: null,
    lastTimestamp,
    usage: {
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      audioSeconds: 0,
      estimatedCostUsd: 0,
      unknownCosts: 0,
      unknownTokenRequests: 0,
      estimatedTokenRequests: 0,
      services: [],
    },
  };
}

test('saves reports and prefers the latest report of the preceding outline session', () => {
  memory.clear();
  assert.equal(manager.priorSessionReport(outline[3].path), undefined);
  manager.saveSessionReport(outline[2].path, report('old preceding', '2024-01-01T00:00:00Z'));
  manager.saveSessionReport(outline[2].path, report('new preceding', '2024-01-02T00:00:00Z'));
  manager.saveSessionReport(
    outline[1].path,
    report('more recent elsewhere', '2025-01-01T00:00:00Z'),
  );
  const previous = manager.priorSessionReport(outline[3].path);
  assert.equal(previous.path, outline[2].path);
  assert.equal(previous.report.summary, 'new preceding');
  assert.equal(JSON.parse(memory.get('sunny-session-reports')).length, 3);
});

test('falls back to the most recently active reported session, excluding the current session', () => {
  memory.clear();
  manager.saveSessionReport(outline[0].path, report('recent', '2025-03-01T00:00:00Z'));
  manager.saveSessionReport(outline[1].path, report('older', '2024-01-01T00:00:00Z'));
  manager.saveSessionReport(outline[5].path, report('current', '2026-01-01T00:00:00Z'));
  assert.equal(manager.priorSessionReport(outline[5].path).report.summary, 'recent');
  assert.equal(manager.priorSessionReport(outline[0].path).report.summary, 'current');
});

test('missing dates fall back to report time and malformed storage is surfaced', () => {
  memory.clear();
  manager.saveSessionReport(outline[0].path, report('undated'));
  assert.equal(manager.priorSessionReport(outline[2].path).report.summary, 'undated');
  assert.throws(() => manager.priorSessionReport('/missing'), /not in the outline/);
  memory.set('sunny-session-reports', '{}');
  assert.throws(() => manager.priorSessionReport(outline[0].path), /invalid/);
  assert.throws(() => manager.saveSessionReport(outline[0].path, report('new')), /invalid/);
  assert.equal(memory.get('sunny-session-reports'), '{}');
});

test('derives totals for older saved reports and preserves newly saved totals', () => {
  memory.clear();
  const old = report('legacy', '2024-01-01T00:05:00Z');
  old.firstTimestamp = '2024-01-01T00:00:00Z';
  old.usage.inputTokens = 30;
  old.usage.outputTokens = 10;
  old.usage.estimatedCostUsd = 0.02;
  memory.set(
    'sunny-session-reports',
    JSON.stringify([
      {
        path: outline[0].path,
        generatedAt: '2024-01-01T00:05:00Z',
        report: old,
      },
    ]),
  );
  const retrieved = manager.priorSessionReport(outline[1].path).report;
  assert.equal(retrieved.totalTimeSeconds, 300);
  assert.equal(retrieved.totalTokens, 40);
  assert.equal(retrieved.totalEstimatedCostUsd, 0.02);
  manager.saveSessionReport(outline[0].path, retrieved);
  const stored = JSON.parse(memory.get('sunny-session-reports'))[1].report;
  assert.equal(stored.totalTimeSeconds, 300);
  assert.equal(stored.totalTokens, 40);
  assert.equal(stored.totalEstimatedCostUsd, 0.02);
});

test('welcomes back incomplete sessions after one hour since the latest non-empty transcription', () => {
  memory.clear();
  const path = outline[0].path;
  const messages = [
    { id: 0, role: 'assistant', content: 'Hello', timestamp: '2026-01-01T10:00:00Z' },
    { id: 1, role: 'user', content: 'I have a goal', timestamp: '2026-01-01T10:05:00Z' },
    { id: 2, role: 'status', content: '', timestamp: '2026-01-01T10:15:00Z' },
    { id: 3, role: 'assistant', content: 'Tell me more', timestamp: '2026-01-01T10:16:00Z' },
  ];
  assert.equal(
    manager.shouldWelcomeBack(path, messages, new Date('2026-01-01T11:04:59.999Z')),
    false,
  );
  assert.equal(manager.shouldWelcomeBack(path, messages, new Date('2026-01-01T11:05:00Z')), true);
  assert.equal(
    manager.shouldWelcomeBack(path, messages.slice(0, 1), new Date('2026-01-02T00:00:00Z')),
    false,
  );
  assert.equal(
    manager.shouldWelcomeBack(path, [{ ...messages[1], timestamp: undefined }], new Date()),
    false,
  );
  assert.equal(
    manager.shouldWelcomeBack(path, [messages[0], { ...messages[1], deleted: true }], new Date()),
    false,
  );
  assert.equal(manager.shouldWelcomeBack(path, messages, new Date('2026-01-01T09:00:00Z')), false);

  const recent = [
    ...messages,
    { id: 4, role: 'user', content: 'Another thought', timestamp: '2026-01-01T10:30:00Z' },
  ];
  assert.equal(manager.shouldWelcomeBack(path, recent, new Date('2026-01-01T11:05:00Z')), false);
  manager.saveSessionReport(path, report('In progress', '2026-01-01T10:16:00Z'));
  assert.equal(manager.shouldWelcomeBack(path, messages, new Date('2026-01-01T11:05:00Z')), true);

  const completed = report('Done', '2026-01-01T10:16:00Z');
  completed.rank = 4;
  manager.saveSessionReport(path, completed);
  assert.equal(manager.shouldWelcomeBack(path, messages, new Date('2026-01-01T11:05:00Z')), false);
  const resumed = [
    ...messages,
    { id: 4, role: 'user', content: 'One more thing', timestamp: '2026-01-01T11:20:00Z' },
  ];
  assert.equal(manager.shouldWelcomeBack(path, resumed, new Date('2026-01-01T12:20:00Z')), false);
  const restarted = [
    { id: 5, role: 'assistant', content: 'Starting again', timestamp: '2026-01-02T10:00:00Z' },
    { id: 6, role: 'user', content: 'New goal', timestamp: '2026-01-02T10:05:00Z' },
  ];
  assert.equal(manager.shouldWelcomeBack(path, restarted, new Date('2026-01-02T11:05:00Z')), true);
});
