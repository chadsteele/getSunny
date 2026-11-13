import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSessionReport, reportTimestamps } from '../src/lib/session-report.ts';

test('accepts reports with the required fields and nullable values', () => {
  const report = { name: null, summary: '', rank: null, comments: null };
  assert.deepEqual(parseSessionReport(JSON.stringify(report)), report);
  assert.deepEqual(
    parseSessionReport('{"name":"Sam","summary":"A dream","rank":5,"comments":"Good"}'),
    {
      name: 'Sam',
      summary: 'A dream',
      rank: 5,
      comments: 'Good',
    },
  );
});

test('rejects invalid JSON and reports with incorrect fields or values', () => {
  const invalid = [
    'not json',
    '[]',
    '{"name":null,"summary":"","rank":null}',
    '{"name":null,"summary":"","rank":null,"comments":null,"extra":1}',
    '{"name":null,"summary":"","rank":0,"comments":null}',
    '{"name":null,"summary":"","rank":6,"comments":null}',
    '{"name":null,"summary":"","rank":2.5,"comments":null}',
    '{"name":null,"summary":"","rank":"5","comments":null}',
    '{"name":null,"summary":null,"rank":null,"comments":null}',
    '{"name":12,"summary":"","rank":null,"comments":null}',
    '{"name":null,"summary":"","rank":null,"comments":[]}',
  ];
  for (const text of invalid) assert.throws(() => parseSessionReport(text));
});

test('reports the timestamps of the first and last messages without inventing missing dates', () => {
  const first = { id: 1, role: 'user', content: 'first', timestamp: '2024-01-01T00:00:00.000Z' };
  const last = { id: 2, role: 'assistant', content: 'last', timestamp: '2024-01-02T00:00:00.000Z' };
  const old = { id: 3, role: 'user', content: 'old' };
  assert.deepEqual(reportTimestamps([first, last]), {
    firstTimestamp: first.timestamp,
    lastTimestamp: last.timestamp,
  });
  assert.deepEqual(reportTimestamps([old, last]), {
    firstTimestamp: null,
    lastTimestamp: last.timestamp,
  });
  assert.deepEqual(reportTimestamps([first, old]), {
    firstTimestamp: first.timestamp,
    lastTimestamp: null,
  });
  assert.deepEqual(reportTimestamps([first]), {
    firstTimestamp: first.timestamp,
    lastTimestamp: first.timestamp,
  });
  assert.deepEqual(reportTimestamps([]), { firstTimestamp: null, lastTimestamp: null });
});
