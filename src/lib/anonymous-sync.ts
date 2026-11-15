import outline from './sessions/outline';
import { chatStorageKey } from './session-manager/session-storage';
import { getInitialUid } from './initial-uid';

const credentialKey = 'sunny-anonymous-credential';
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let active = false;
let changed = false;
let onError: (message: string) => void = () => {};

function credential(): string {
  const saved = localStorage.getItem(credentialKey);
  if (saved !== null) {
    if (!/^[0-9a-f]{64}$/.test(saved)) throw new Error('The saved browser credential is invalid.');
    return saved;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(credentialKey, token);
  return token;
}

function snapshot() {
  const sessions = outline.flatMap(({ path }) => {
    const stored = localStorage.getItem(chatStorageKey(path));
    if (stored === null) return [];
    const messages: unknown = JSON.parse(stored);
    if (!Array.isArray(messages)) throw new Error('Saved session chat is invalid.');
    return [{ path, messages }];
  });
  const stored = localStorage.getItem('sunny-session-reports');
  const reports: unknown = stored === null ? [] : JSON.parse(stored);
  if (!Array.isArray(reports)) throw new Error('Saved session reports are invalid.');
  return { initialUid: getInitialUid(), sessions, reports };
}

function schedule(delay: number) {
  if (!active || timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void flush();
  }, delay);
}

async function flush() {
  if (!active || running || !changed) return;
  running = true;
  try {
    if (!navigator.locks) throw new Error('This browser does not support safe synchronization.');
    await navigator.locks.request('sunny-anonymous-sync', async () => {
      const body = JSON.stringify(snapshot());
      const response = await fetch('/.netlify/functions/sync-anonymous', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credential()}`,
          'content-type': 'application/json',
        },
        body,
      });
      if (!response.ok) {
        throw new Error(`Conversation synchronization failed (HTTP ${response.status}).`);
      }
      changed = JSON.stringify(snapshot()) !== body;
    });
    onError('');
  } catch (error) {
    console.error('[Sunny] Anonymous synchronization failed:', error);
    onError('Conversation could not be saved online. It remains on this device; retrying.');
    changed = true;
    schedule(15_000);
  } finally {
    running = false;
    if (changed) schedule(1_000);
  }
}

export function scheduleAnonymousSync(): void {
  changed = true;
  schedule(500);
}

export function startAnonymousSync(notify: (message: string) => void): () => void {
  active = true;
  onError = notify;
  scheduleAnonymousSync();
  const online = () => scheduleAnonymousSync();
  const storage = (event: StorageEvent) => {
    if (
      event.key === 'sunny-session-reports' ||
      event.key === 'sunny-chat-thread' ||
      event.key?.startsWith('sunny-chat-thread:')
    ) {
      scheduleAnonymousSync();
    }
  };
  window.addEventListener('online', online);
  window.addEventListener('storage', storage);
  return () => {
    active = false;
    window.removeEventListener('online', online);
    window.removeEventListener('storage', storage);
    if (timer) clearTimeout(timer);
    timer = undefined;
    onError = () => {};
  };
}
