function timestamp() {
  return `[${new Date().toISOString()}]`;
}

function write(method: 'error' | 'log' | 'warn', args: unknown[]) {
  globalThis.console[method](timestamp(), ...args);
}

export const logger = {
  error: (...args: unknown[]) => write('error', args),
  log: (...args: unknown[]) => write('log', args),
  warn: (...args: unknown[]) => write('warn', args),
};
