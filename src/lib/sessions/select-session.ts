import type { BabyStep } from './types';

export interface SessionProgress {
  path: string;
  completedAt: string | null;
}

export type SessionSelection =
  { kind: 'session'; session: BabyStep; isNew: boolean } | { kind: 'complete' };

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
