const timers = new Map();

function timestamp() {
  return `[${new Date().toISOString()}]`;
}

function write(method, args) {
  globalThis.console[method](timestamp(), ...args);
}

export const logger = {
  debug: (...args) => write('debug', args),
  error: (...args) => write('error', args),
  info: (...args) => write('info', args),
  log: (...args) => write('log', args),
  warn: (...args) => write('warn', args),
  time: (label) => {
    timers.set(label, performance.now());
    write('debug', [`${label}: started`]);
  },
  timeEnd: (label) => {
    const startedAt = timers.get(label);
    timers.delete(label);
    const elapsed =
      startedAt === undefined ? 'unknown' : `${(performance.now() - startedAt).toFixed(1)} ms`;
    write('debug', [`${label}: ${elapsed}`]);
  },
};
