/**
 * App constants and configuration values
 */

export const PORT = process.env.PORT || 3000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const BRO_AI_SECRET_TOKEN = process.env.BRO_AI_SECRET_TOKEN;

// SSE event names
export const SSE_EVENTS = {
  META: "meta",
  TOKEN: "token",
  PREVIEW: "preview",
  FINAL: "final",
  DONE: "done",
  ERROR: "error",
};

// Chat history limits
export const CHAT_HISTORY_MAX_MESSAGES = 20;

// Max concurrent in-memory sessions before oldest is evicted (pre-Redis limit)
export const MAX_SESSIONS = 10;

// Response timeouts (in ms)
export const STREAM_TIMEOUT = 300000; // 5 minutes
