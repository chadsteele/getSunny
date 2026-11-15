import type { SessionTiming } from './types';

const MINIMUM_INTERVAL_MS = 18 * 60 * 60 * 1000;

export function startsAtLeast18HoursAfterPreviousSession({
  sessionStart,
  previousSessionEnd,
}: SessionTiming): boolean {
  const startTime = sessionStart.getTime();
  if (!Number.isFinite(startTime)) throw new RangeError('Invalid session start time.');
  if (previousSessionEnd === null) return true;

  const previousEndTime = previousSessionEnd.getTime();
  if (!Number.isFinite(previousEndTime)) throw new RangeError('Invalid previous session end time.');

  return startTime - previousEndTime >= MINIMUM_INTERVAL_MS;
}
