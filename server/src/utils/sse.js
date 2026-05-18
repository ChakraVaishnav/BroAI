/**
 * Server-Sent Events (SSE) helper utilities
 */

/**
 * Initialize SSE headers eagerly at the start of a request.
 * Call this BEFORE any async work to guarantee correct Content-Type.
 */
export function initSSE(res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
}

/**
 * Send a single Server-Sent Event to the response.
 * Headers must already be set via initSSE().
 */
export function sendSSE(res, data, eventName = "message") {
  try {
    const payload = typeof data === "string" ? data : JSON.stringify(data);
    const eventLine = eventName ? `event: ${eventName}\n` : "";
    const dataLines = payload.split(/\r?\n/).map((line) => `data: ${line}`).join("\n");
    res.write(`${eventLine}${dataLines}\n\n`);
  } catch (e) {
    // best-effort: log and ignore stream errors
    console.error("sendSSE error:", e?.message || e);
  }
}
