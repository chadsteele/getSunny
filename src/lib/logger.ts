const timers = new Map<string, number>();

function timestamp() {
  return `[${new Date().toISOString()}]`;
}

function write(method: 'debug' | 'error' | 'info' | 'log' | 'warn', args: unknown[]) {
  globalThis.console[method](timestamp(), ...args);
}

export const logger = {
  debug: (...args: unknown[]) => write('debug', args),
  error: (...args: unknown[]) => write('error', args),
  info: (...args: unknown[]) => write('info', args),
  log: (...args: unknown[]) => write('log', args),
  warn: (...args: unknown[]) => write('warn', args),
  time: (label: string) => {
    timers.set(label, performance.now());
    write('debug', [`${label}: started`]);
  },
  timeEnd: (label: string) => {
    const startedAt = timers.get(label);
    timers.delete(label);
    const elapsed = startedAt === undefined ? 'unknown' : `${(performance.now() - startedAt).toFixed(1)} ms`;
    write('debug', [`${label}: ${elapsed}`]);
  },
};
