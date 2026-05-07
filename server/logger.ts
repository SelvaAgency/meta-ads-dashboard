/**
 * Lightweight logger — silences verbose output in production.
 * Set LOG_LEVEL=debug to re-enable detailed logs.
 */
const isDebug = process.env.LOG_LEVEL === "debug";

export const logger = {
  info: (...args: unknown[]) => { if (isDebug) console.log(...args); },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
