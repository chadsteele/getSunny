import { llmUsage, type UsageRecord } from './usage';
import { logger as console } from './logger';

export interface ChatRequest {
  systemPrompt: string;
  history: { role: 'user' | 'model'; parts: { text: string }[] }[];
  prompt: string;
}

export function requestChatStream(payload: ChatRequest, signal?: AbortSignal) {
  console.log('[Sunny] LLM request:', JSON.stringify(payload));
  return fetch('/.netlify/functions/chat-stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
}

export async function readChatStream(
  response: Response,
  onText: (text: string) => void,
  onUsage: (usage: UsageRecord) => void,
) {
  if (!response.ok || !response.body) {
    throw new Error(`Chat stream request failed (${response.status}): ${await response.text()}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let rawResponse = '';
  let seenUsage = false;
  const processLine = (line: string) => {
    if (!line.trim()) return;
    const event: unknown = JSON.parse(line);
    if (!event || typeof event !== 'object' || !('type' in event)) {
      throw new Error('Invalid chat stream event.');
    }
    if (event.type === 'text' && 'text' in event && typeof event.text === 'string') {
      rawResponse += event.text;
      onText(event.text);
    } else if (
      event.type === 'usage' &&
      'usage' in event &&
      event.usage &&
      typeof event.usage === 'object' &&
      'prompt_tokens' in event.usage &&
      typeof event.usage.prompt_tokens === 'number' &&
      'completion_tokens' in event.usage &&
      typeof event.usage.completion_tokens === 'number'
    ) {
      if (seenUsage) throw new Error('Duplicate language model usage.');
      seenUsage = true;
      onUsage(llmUsage(event.usage.prompt_tokens, event.usage.completion_tokens));
    } else {
      throw new Error('Invalid chat stream event.');
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(processLine);
      if (done) break;
    }
    if (buffer.trim()) processLine(buffer);
    if (!seenUsage) console.warn('[Sunny] Language model stream did not include usage.');
  } finally {
    console.log('[Sunny] LLM response:', JSON.stringify({ raw: rawResponse }));
  }
}
