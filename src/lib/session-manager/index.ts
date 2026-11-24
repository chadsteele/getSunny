import { createChatThreadStore } from '../chat-thread-store.svelte';
import type { BabyStep } from '../sessions/types';
import { chatStorageKey, clearRestartRequest, shouldRestartSession } from './session-storage';
import { hasRatedReportSince } from './reports';
import type { ChatMessage } from '../chat-thread-store.svelte';
import { scheduleAnonymousSync } from '../anonymous-sync';

export { availableSessionPaths, selectSession } from './select-session';
export { completedSessionEnds, priorSessionReport, saveSessionReport } from './reports';
export type { SavedSessionReport, SessionReportEntry } from './reports';
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

export function createSessionChat(path: string) {
  const chat = createChatThreadStore(chatStorageKey(path), scheduleAnonymousSync);
  function initialize(): boolean {
    chat.restore(true);
    if (shouldRestartSession(path)) {
      chat.clear();
      clearRestartRequest();
    }
    return !chat.messages.some((message) => message.role !== 'status');
  }
  return { chat, initialize };
}

export function shouldWelcomeBack(
  path: string,
  messages: readonly ChatMessage[],
  now: Date,
): boolean {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid current time.');
  const lastTranscript = messages.findLast(
    (message) => !message.deleted && message.role === 'user' && message.content.trim(),
  );
  if (!lastTranscript?.timestamp) return false;
  const lastSpeech = Date.parse(lastTranscript.timestamp);
  if (!Number.isFinite(lastSpeech)) throw new Error('Invalid transcription timestamp.');
  if (now.getTime() - lastSpeech < 60 * 60 * 1000) return false;
  const firstMessage = messages.find(
    (message) => !message.deleted && message.role !== 'status' && message.content.trim(),
  );
  if (!firstMessage?.timestamp) return false;
  return !hasRatedReportSince(path, firstMessage.timestamp);
}

export function sessionPrompts(session: BabyStep) {
  const intro = session.intro;
  if (typeof intro !== 'string' || !intro.trim()) {
    throw new Error('The session opening prompt is not configured.');
  }
  const sections = [
    ['Role', session.role],
    ['Process', session.process],
    ['Objectives', session.objectives],
    ['Rules', session.rules],
    ['Commands', session.commands],
  ] as const;
  const prompt = [
    ...(session.prompt?.trim() ? [session.prompt] : []),
    ...sections.filter(([, text]) => text?.trim()).map(([label, text]) => `${label}:\n\n${text}`),
  ].join('\n\n');
  if (!prompt.trim()) {
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
