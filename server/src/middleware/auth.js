/**
 * Authentication middleware
 * Validates BRO_AI_SECRET_TOKEN from Authorization header
 */
import { debugLog } from "../utils/logger.js";
import { initSSE, sendSSE } from "../utils/sse.js";
import { BRO_AI_SECRET_TOKEN, SSE_EVENTS } from "../config/constants.js";

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (BRO_AI_SECRET_TOKEN && authHeader !== `Bearer ${BRO_AI_SECRET_TOKEN}`) {
    debugLog("[BACKEND] ❌ Unauthorized request blocked.");
    initSSE(res); // Must set SSE headers before writing any event
    sendSSE(res, "Unauthorized. Invalid or missing secret token.", SSE_EVENTS.ERROR);
    return res.end();
  }
  
  next();
}
