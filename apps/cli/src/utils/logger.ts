export const logger = {
  log: (...args: any[]) => {
    console.log('✓', ...args);
  },
  error: (...args: any[]) => {
    console.error('✗', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('⚠', ...args);
  },
  info: (...args: any[]) => {
    console.info('ℹ', ...args);
  },
};

