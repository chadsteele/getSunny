import type { BabyStep } from '../sessions/types';

export interface SessionProgress {
  path: string;
  completedAt: string | null;
}

export type SessionSelection =
  { kind: 'session'; session: BabyStep; isNew: boolean } | { kind: 'complete' };

export function availableSessionPaths(
  outline: readonly BabyStep[],
  startedPaths: readonly string[],
  selectedPath: string,
  completedEnds: ReadonlyMap<string, string>,
  now: Date,
  hostname: string,
): string[] {
  if (outline.length === 0) throw new Error('The session outline is empty.');
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid session start time.');
  const selectedIndex = outline.findIndex((session) => session.path === selectedPath);
  if (selectedIndex < 0) throw new Error('The current session is not in the outline.');
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname.toLowerCase())) {
    return outline.map((session) => session.path);
  }

  let currentIndex = Math.max(
    selectedIndex,
    ...outline.map((session, index) => (startedPaths.includes(session.path) ? index : 0)),
  );
  while (currentIndex < outline.length - 1) {
    const completedAt = completedEnds.get(outline[currentIndex].path);
    if (completedAt === undefined) break;
    const previousSessionEnd = new Date(completedAt);
    if (!Number.isFinite(previousSessionEnd.getTime())) {
      throw new RangeError('Invalid session completion time.');
    }
    if (!outline[currentIndex + 1].condition({ sessionStart: now, previousSessionEnd })) break;
    currentIndex++;
  }
  return outline.slice(0, currentIndex + 1).map((session) => session.path);
}

export function selectSession(
  outline: readonly BabyStep[],
  history: readonly SessionProgress[],
  now: Date,
): SessionSelection {
  if (outline.length === 0) throw new Error('The session outline is empty.');
  if (!Number.isFinite(now.getTime())) throw new RangeError('Invalid session start time.');

  const first = outline[0];
  if (history.length === 0) {
    if (!first.condition({ sessionStart: now, previousSessionEnd: null })) {
      throw new Error('The first session is not available.');
    }
    return { kind: 'session', session: first, isNew: true };
  }

  const current = history[history.length - 1];
  const index = outline.findIndex((session) => session.path === current.path);
  if (index < 0) throw new Error('The current session is not in the outline.');
  if (current.completedAt === null) {
    return { kind: 'session', session: outline[index], isNew: false };
  }

  const previousSessionEnd = new Date(current.completedAt);
  if (!Number.isFinite(previousSessionEnd.getTime())) {
    throw new RangeError('Invalid session completion time.');
  }
  const next = outline[index + 1];
  if (!next) return { kind: 'complete' };
  if (!next.condition({ sessionStart: now, previousSessionEnd })) {
    return { kind: 'session', session: outline[index], isNew: false };
  }
  return { kind: 'session', session: next, isNew: true };
}
