import { createChatThreadStore } from '../chat-thread-store.svelte';
import type { BabyStep } from '../sessions/types';
import { chatStorageKey, clearRestartRequest, shouldRestartSession } from './session-storage';

export { selectSession } from './select-session';
export type { SessionProgress, SessionSelection } from './select-session';
export { startsAtLeast18HoursAfterPreviousSession } from './condition';
export {
  chatStorageKey,
  currentSession,
  hasSessionHistory,
  selectSessionForChat,
  shouldRestartSession,
  clearRestartRequest,
} from './session-storage';

export interface SessionGroup {
  name: string;
  phases: { name: string; sessions: BabyStep[] }[];
}

export function groupSessions(outline: readonly BabyStep[]): SessionGroup[] {
  return outline.reduce<SessionGroup[]>((result, session) => {
    let step = result.find((item) => item.name === session.step);
    if (!step) {
      step = { name: session.step, phases: [] };
      result.push(step);
    }
    let phase = step.phases.find((item) => item.name === session.phase);
    if (!phase) {
      phase = { name: session.phase, sessions: [] };
      step.phases.push(phase);
    }
    phase.sessions.push(session);
    return result;
  }, []);
}

export function isSessionEnabled(
  session: BabyStep,
  startedPaths: readonly string[],
  now: Date,
): boolean {
  return (
    startedPaths.includes(session.path) ||
    session.condition({ sessionStart: now, previousSessionEnd: null })
  );
}

export function createSessionChat(path: string) {
  const chat = createChatThreadStore(chatStorageKey(path));
  function initialize(): boolean {
    chat.restore(true);
    if (shouldRestartSession(path)) {
      chat.clear();
      clearRestartRequest();
    }
    return chat.messages.length === 0;
  }
  return { chat, initialize };
}

export function sessionPrompts(session: BabyStep) {
  const intro = session.intro;
  const prompt = session.prompt;
  if (typeof intro !== 'string' || !intro.trim()) {
    throw new Error('The session opening prompt is not configured.');
  }
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('The conversation system prompt is not configured.');
  }
  const startMarker = 'Session Opening Script';
  const endMarker = 'Session Closing (After Story Consolidation)';
  const start = intro.indexOf(startMarker);
  const end = intro.indexOf(endMarker);
  const opening =
    start < 0 || end <= start
      ? intro
      : intro
          .slice(start + startMarker.length, end)
          .trim()
          .replace(/^"|"$/g, '');
  return { opening, prompt };
}
