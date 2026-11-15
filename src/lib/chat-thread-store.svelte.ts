import { logger as console } from './logger';

export type ChatRole = 'user' | 'assistant' | 'status';
export type ChatMessage = {
  id: number;
  role: ChatRole;
  content: string;
  timestamp?: string;
  deleted?: boolean;
};

const DEFAULT_STORAGE_KEY = 'sunny-chat-thread';

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'number' &&
    typeof message.content === 'string' &&
    (message.deleted === undefined || typeof message.deleted === 'boolean') &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'status')
  );
}

export function createChatThreadStore(storageKey = DEFAULT_STORAGE_KEY) {
  let messages = $state<ChatMessage[]>([]);
  let nextMessageId = 0;

  function persist() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (error) {
      console.warn('[Sunny] Unable to persist chat thread to browser storage:', error);
    }
  }

  function restore(strict = false) {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as unknown;
      if (stored === null) return;
      if (!Array.isArray(stored)) throw new Error('Saved chat is not an array.');
      messages = stored.filter(isChatMessage).map((message) => {
        if (message.timestamp === undefined) return message;
        if (typeof message.timestamp === 'string' && !Number.isNaN(Date.parse(message.timestamp))) {
          return message;
        }
        console.warn('[Sunny] Invalid chat message timestamp:', { messageId: message.id });
        return { ...message, timestamp: undefined };
      });
      nextMessageId = messages.reduce(
        (highestId, message) => Math.max(highestId, message.id + 1),
        0,
      );
      console.log('[Sunny] Restored chat thread from browser storage:', {
        messageCount: messages.length,
      });
    } catch (error) {
      console.warn('[Sunny] Unable to restore chat thread from browser storage:', error);
      if (strict) throw error;
    }
  }

  function add(role: ChatRole, content: string) {
    const message = content.trim();
    if (!message && role !== 'assistant') return;
    const id = nextMessageId++;
    messages.push({ id, role, content: message, timestamp: new Date().toISOString() });
    persist();
    return id;
  }

  function update(messageId: number, content: string) {
    const message = messages.find(({ id }) => id === messageId);
    if (!message) return;
    message.content = content;
    persist();
  }

  function clear() {
    const updated = messages.map((message) => ({ ...message, deleted: true }));
    if (typeof localStorage === 'undefined') throw new Error('Browser storage is unavailable.');
    localStorage.setItem(storageKey, JSON.stringify(updated));
    messages = updated;
  }

  function removeMessagesBefore(messageId: number) {
    messages = messages.map((message) =>
      message.id >= messageId ? { ...message, deleted: true } : message,
    );
    persist();
  }

  return {
    get messages() {
      return messages.filter((message) => !message.deleted);
    },
    restore,
    add,
    update,
    clear,
    removeMessagesBefore,
  };
}
