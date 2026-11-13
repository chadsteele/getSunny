function timestamp() {
  return `[${new Date().toISOString()}]`;
}

function write(method, args) {
  globalThis.console[method](timestamp(), ...args);
}

export const logger = {
  error: (...args) => write('error', args),
  log: (...args) => write('log', args),
  warn: (...args) => write('warn', args),
};
