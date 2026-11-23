export const spokenJsonInstruction =
  'Return one valid JSON object, without markdown. Put the complete spoken reply in the first property, "text", as a non-empty string. Include any question in "text"; optionally also include it in "ask". Optional metadata such as "mute_mic" or "session_complete" is not spoken.';

export function parseSpokenJson(raw: string): { text: string; [key: string]: unknown } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('The language model response is not valid JSON.');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('text' in value) ||
    typeof value.text !== 'string' ||
    !value.text.trim() ||
    ('ask' in value && value.ask !== null && typeof value.ask !== 'string')
  ) {
    throw new Error('The language model response must contain spoken text and a valid question.');
  }
  return { ...value, text: value.text };
}

function spokenTextStart(raw: string): number | undefined {
  if (!/^\s*\{/.test(raw)) return;
  let depth = 0;
  let previous = '';
  for (let index = 0; index < raw.length; index++) {
    const character = raw[index];
    if (character === '"') {
      const start = index;
      index++;
      while (index < raw.length && raw[index] !== '"') {
        if (raw[index] === '\\') index++;
        index++;
      }
      if (index >= raw.length) return;
      if (depth === 1 && (previous === '{' || previous === ',')) {
        const key: unknown = JSON.parse(raw.slice(start, index + 1));
        let next = index + 1;
        while (/\s/.test(raw[next] ?? '')) next++;
        if (raw[next] !== ':') return;
        next++;
        while (/\s/.test(raw[next] ?? '')) next++;
        if (key === 'text') return raw[next] === '"' ? next + 1 : undefined;
      }
      previous = '"';
    } else if (character === '{' || character === '[') {
      depth++;
      previous = character;
    } else if (character === '}' || character === ']') {
      depth--;
      previous = character;
    } else if (!/\s/.test(character)) {
      previous = character;
    }
  }
}

export function createSpokenJsonStream() {
  let raw = '';
  let emitted = '';

  function append(chunk: string) {
    raw += chunk;
    const start = spokenTextStart(raw);
    if (start === undefined) return '';
    let end = start;
    while (end < raw.length) {
      if (raw[end] === '"') break;
      if (raw[end] === '\\') {
        if (end + 1 >= raw.length) break;
        if (raw[end + 1] === 'u') {
          if (end + 6 > raw.length) break;
          if (!/^[\da-fA-F]{4}$/.test(raw.slice(end + 2, end + 6))) break;
          end += 6;
        } else {
          if (!'"\\/bfnrt'.includes(raw[end + 1])) break;
          end += 2;
        }
      } else {
        if (raw.charCodeAt(end) < 0x20) break;
        end += 1;
      }
    }
    let text: string = JSON.parse(`"${raw.slice(start, end)}"`);
    if (text.length && /[\uD800-\uDBFF]/.test(text.at(-1)!)) text = text.slice(0, -1);
    if (!text.startsWith(emitted)) throw new Error('The streamed speech changed unexpectedly.');
    const next = text.slice(emitted.length);
    emitted = text;
    return next;
  }

  function finish() {
    const result = parseSpokenJson(raw);
    if (!result.text.startsWith(emitted)) {
      throw new Error('The streamed speech does not match the final response.');
    }
    const remaining = result.text.slice(emitted.length);
    emitted = result.text;
    return { result, remaining };
  }

  return { append, finish };
}
