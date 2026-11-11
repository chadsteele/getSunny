import { logger as console } from './logger';

export type ChatRole = 'user' | 'assistant' | 'status';
export type ChatMessage = { id: number; role: ChatRole; content: string };

const DEFAULT_STORAGE_KEY = 'sunny-chat-thread';

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Partial<ChatMessage>;
  return (
    typeof message.id === 'number' &&
    typeof message.content === 'string' &&
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

  function restore() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as unknown;
      if (!Array.isArray(stored)) return;
      messages = stored.filter(isChatMessage);
      nextMessageId = messages.reduce(
        (highestId, message) => Math.max(highestId, message.id + 1),
        0,
      );
      console.log('[Sunny] Restored chat thread from browser storage:', {
        messageCount: messages.length,
      });
    } catch (error) {
      console.warn('[Sunny] Unable to restore chat thread from browser storage:', error);
    }
  }

  function add(role: ChatRole, content: string) {
    const message = content.trim();
    if (!message && role !== 'assistant') return;
    const id = nextMessageId++;
    messages.push({ id, role, content: message });
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
    messages = [];
    nextMessageId = 0;
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(storageKey);
  }

  function removeMessagesBefore(messageId: number) {
    messages = messages.filter((message) => message.id < messageId);
    persist();
  }

  function context() {
    return messages
      .filter(({ role }) => role !== 'status')
      .map(({ role, content }) => `${role === 'user' ? 'User' : 'Sunny'}: ${content}`)
      .join('\n\n');
  }

  return {
    get messages() {
      return messages;
    },
    restore,
    add,
    update,
    clear,
    removeMessagesBefore,
    context,
  };
}
