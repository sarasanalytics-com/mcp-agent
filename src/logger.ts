import { env } from "./config";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel: LogLevel = env.LOG_LEVEL;

function log(level: LogLevel, message: string, data?: Record<string, unknown>, context?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[currentLevel]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...context,
    ...data,
  };

  const out = level === "error" ? console.error : console.log;
  out(JSON.stringify(entry));
}

export interface Logger {
  debug: (msg: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
  /** Create a child logger with additional bound context */
  child: (context: Record<string, unknown>) => Logger;
}

function createLogger(context?: Record<string, unknown>): Logger {
  return {
    debug: (msg, data) => log("debug", msg, data, context),
    info: (msg, data) => log("info", msg, data, context),
    warn: (msg, data) => log("warn", msg, data, context),
    error: (msg, data) => log("error", msg, data, context),
    child: (childCtx) => createLogger({ ...context, ...childCtx }),
  };
}

export const logger: Logger = createLogger();
