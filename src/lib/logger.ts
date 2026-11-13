import { writable } from 'svelte/store';

export interface LogEntry {
  id: number;
  timestamp: string;
  level: 'error' | 'log' | 'warn';
  message: string;
}

const maxEntries = 200;
const entries = writable<LogEntry[]>([]);
let nextId = 0;

function timestamp() {
  return `[${new Date().toISOString()}]`;
}

function formatArgument(value: unknown, seen = new Set<Error>()): string {
  if (value instanceof Error) {
    if (seen.has(value)) return '[Circular error cause]';
    seen.add(value);
    const cause =
      value.cause === undefined ? '' : `\nCaused by: ${formatArgument(value.cause, seen)}`;
    return `${value.stack ?? `${value.name}: ${value.message}`}${cause}`;
  }
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch (error) {
    globalThis.console.warn('Unable to serialize log argument:', error);
    return String(value);
  }
}

function write(method: 'error' | 'log' | 'warn', args: unknown[]) {
  const time = timestamp();
  globalThis.console[method](time, ...args);
  if (typeof window === 'undefined') return;
  const entry = {
    id: nextId++,
    timestamp: time,
    level: method,
    message: args.map((arg) => formatArgument(arg)).join(' '),
  };
  entries.update((current) => [...current.slice(-(maxEntries - 1)), entry]);
}

export const logEntries = { subscribe: entries.subscribe };

export const logger = {
  error: (...args: unknown[]) => write('error', args),
  log: (...args: unknown[]) => write('log', args),
  warn: (...args: unknown[]) => write('warn', args),
};
