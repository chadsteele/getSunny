import outline from '../sessions/outline';
import type { BabyStep } from '../sessions/types';

const selectionKey = 'sunny-current-session';
const restartKey = 'sunny-session-restart';
const legacyChatKey = 'sunny-chat-thread';

export function chatStorageKey(path: string): string {
  return path === outline[0].path ? legacyChatKey : `sunny-chat-thread:${path}`;
}

export function currentSession(): BabyStep {
  const path = localStorage.getItem(selectionKey);
  if (path === null) return outline[0];
  const session = outline.find((item) => item.path === path);
  if (!session) throw new Error('The saved session is not in the outline.');
  return session;
}

export function hasSessionHistory(session: BabyStep): boolean {
  const stored = localStorage.getItem(chatStorageKey(session.path));
  if (stored === null) return false;
  const messages: unknown = JSON.parse(stored);
  if (!Array.isArray(messages)) throw new Error('Saved session chat is invalid.');
  return messages.length > 0;
}

export function selectSessionForChat(session: BabyStep, restart: boolean): void {
  if (!outline.some((item) => item.path === session.path)) {
    throw new Error('The selected session is not in the outline.');
  }
  if (restart) sessionStorage.setItem(restartKey, session.path);
  else sessionStorage.removeItem(restartKey);
  localStorage.setItem(selectionKey, session.path);
}

export function shouldRestartSession(path: string): boolean {
  return sessionStorage.getItem(restartKey) === path;
}

export function clearRestartRequest(): void {
  sessionStorage.removeItem(restartKey);
}
