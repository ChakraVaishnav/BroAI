/**
 * Chat route handler
 * Handles POST /chat for conversational AI requests
 */
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { buildGraph } from "../agent/graph.js";
import { callTool, getTools } from "../agent/mcpClient.js";
import {
  clearPendingAction,
  formatPendingPreview,
  getPendingAction,
  isCancelMessage,
  isConfirmationMessage,
  isDraftRequestMessage,
} from "../agent/pendingAction.js";
import { SYSTEM_PROMPT } from "../agent/prompts/system.js";
import { readMemory } from "../memory/memory.js";
import { getLlmWithTools, getLastModelUsed, getModelAttempts } from "../llm/groq.js";
import { initSSE, sendSSE } from "../utils/sse.js";
import { debugLog, logError, isRateLimitError } from "../utils/logger.js";
import {
  extractTextFromContent,
  formatManualReply,
  buildActionSuccessText,
  extractActionError,
  isSuccessResult,
} from "../utils/response.js";
import { CHAT_HISTORY_MAX_MESSAGES, SSE_EVENTS, STREAM_TIMEOUT, MAX_SESSIONS } from "../config/constants.js";

let graph;
let streamingLlmWithTools;
let startupMemory;

// Fix #2: Per-session chat history with max-size eviction to prevent memory leaks
const sessionStore = new Map();

function getSession(sessionId) {
  if (!sessionStore.has(sessionId)) {
    if (sessionStore.size >= MAX_SESSIONS) {
      const oldestKey = sessionStore.keys().next().value;
      sessionStore.delete(oldestKey);
      debugLog(`[SESSION] Evicted oldest session (store at ${MAX_SESSIONS} cap).`);
    }
    sessionStore.set(sessionId, { chatHistory: [] });
  }
  return sessionStore.get(sessionId);
}

/**
 * Initialize chat route dependencies
 */
export async function initializeChatRoute() {
  graph = await buildGraph();
  streamingLlmWithTools = getLlmWithTools(await getTools());
  startupMemory = readMemory();
}

/**
 * POST /chat - Main chat handler with streaming support
 */
export async function chatHandler(req, res) {
  // ✅ Fix 1: Set SSE headers eagerly before any async work
  initSSE(res);

  try {
    // ✅ Fix 2: Read sessionId — frontend sends chatId as sessionId
    const { message, sessionId = "default" } = req.body;
    const clientAddr =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown";
    debugLog(`[BACKEND] 🚀 Request from ${clientAddr}: "${message}" (session: ${sessionId})`);

    if (!message) {
      debugLog("[BACKEND] ❌ Missing message");
      sendSSE(res, "Message is required", SSE_EVENTS.ERROR);
      return res.end();
    }

    const todayContext = `The current system date and time is: ${new Date().toLocaleString(
      "en-IN",
      { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "long" }
    )}`;
    const memoryContext = `Persistent memory context: ${JSON.stringify(startupMemory)}`;

    const startTime = Date.now();

    // ✅ Fix 3: Per-session chat history
    const session = getSession(sessionId);
    session.chatHistory.push(new HumanMessage(message));
    if (session.chatHistory.length > CHAT_HISTORY_MAX_MESSAGES) {
      session.chatHistory = session.chatHistory.slice(-CHAT_HISTORY_MAX_MESSAGES);
    }

    // Handle pending action confirmations/cancellations
    const pendingAction = getPendingAction();
    if (pendingAction) {
      if (isCancelMessage(message)) {
        return handleCancelMessage(startTime, res, session);
      }

      if (isDraftRequestMessage(message)) {
        return handleDraftRequest(pendingAction, startTime, res);
      }

      if (isConfirmationMessage(message, pendingAction)) {
        return await handleToolConfirmation(pendingAction, startTime, res, session);
      }
    }

    // Main streaming path
    return await handleStreamingChat(startTime, todayContext, memoryContext, res, session);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);

    logError("=== ERROR ===");
    logError(errorMessage);
    logError((err && err.stack) || "no stack");
    logError("===== END =====");

    if (isRateLimitError(err)) {
      sendSSE(res, "Rate limit exceeded on all available models. Please try again later.", SSE_EVENTS.ERROR);
      return res.end();
    }
    sendSSE(res, `Error: ${errorMessage}`, SSE_EVENTS.ERROR);
    return res.end();
  }
}

/**
 * Handle cancel message
 */
function handleCancelMessage(startTime, res, session) {
  clearPendingAction();
  const replyText = "Sir, canceled. I will not proceed with that action.";
  const formattedReply = formatManualReply(replyText, startTime);
  session.chatHistory.push(new AIMessage(formattedReply));
  debugLog(`[BACKEND][OUT] Cancel response: ${formattedReply}`);
  sendSSE(res, formattedReply, SSE_EVENTS.FINAL);
  return res.end();
}

/**
 * Handle draft request to show preview
 */
function handleDraftRequest(pendingAction, startTime, res) {
  const preview = formatPendingPreview(pendingAction);
  const formattedReply = formatManualReply(preview, startTime);
  // chatHistory.push(new AIMessage(formattedReply));
  debugLog(`[BACKEND][PREVIEW] ${preview}`);
  sendSSE(res, preview, SSE_EVENTS.PREVIEW);
  const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
  debugLog(`[BACKEND][OUT] Sent preview wrapper (timeTaken: ${timeTaken}s)`);
  sendSSE(res, { final: true, timeTaken }, SSE_EVENTS.DONE);
  return res.end();
}

/**
 * Handle tool confirmation and execution
 */
async function handleToolConfirmation(pendingAction, startTime, res, session) {
  try {
    const result = await callTool(
      pendingAction.toolName,
      pendingAction.args || {}
    );
    const replyText = isSuccessResult(result)
      ? buildActionSuccessText(pendingAction, result)
      : `Sir, I could not complete that action: ${extractActionError(
          result,
          "Unknown error"
        )}`;
    if (isSuccessResult(result)) {
      clearPendingAction();
    }
    const formattedReply = formatManualReply(replyText, startTime);
    session.chatHistory.push(new AIMessage(formattedReply));
    debugLog(`[BACKEND][OUT] Tool confirmation response: ${formattedReply}`);
    sendSSE(res, formattedReply, SSE_EVENTS.FINAL);
    return res.end();
  } catch (error) {
    const replyText = `Sir, I could not complete that action: ${error.message}`;
    const formattedReply = formatManualReply(replyText, startTime);
    session.chatHistory.push(new AIMessage(formattedReply));
    debugLog(`[BACKEND][ERROR] Tool execution failed: ${formattedReply}`);
    sendSSE(res, formattedReply, SSE_EVENTS.ERROR);
    return res.end();
  }
}

/**
 * Main streaming chat handler
 */
async function handleStreamingChat(startTime, todayContext, memoryContext, res, session) {
  const abortController = new AbortController();

  // Fix #3: Enforce STREAM_TIMEOUT — abort hung LLM calls automatically
  const timeoutId = setTimeout(() => {
    if (!res.writableEnded) {
      debugLog(`[BACKEND] ⏱️ Stream timeout (${STREAM_TIMEOUT / 1000}s) reached — aborting.`);
      abortController.abort();
    }
  }, STREAM_TIMEOUT);

  res.on("close", () => {
    clearTimeout(timeoutId);
    if (!res.writableEnded) {
      debugLog("[BACKEND] 🛑 Client disconnected prematurely, aborting generation...");
      abortController.abort();
    }
  });

  const baseMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    new SystemMessage(memoryContext),
    new SystemMessage(todayContext),
    ...session.chatHistory,
  ];

  // Fix #4: Use SSE_EVENTS constants instead of raw strings
  let streamedText = "";
  sendSSE(res, { info: "token_stream_start" }, SSE_EVENTS.META);

  for await (const chunk of streamingLlmWithTools.stream(baseMessages, { signal: abortController.signal })) {
    const tokenText = extractTextFromContent(chunk?.content);
    if (!tokenText) continue;
    streamedText += tokenText;
    sendSSE(res, tokenText, SSE_EVENTS.TOKEN);
    try { debugLog(`[BACKEND][TOKEN] ${tokenText}`); } catch (e) { /* ignore */ }
  }

  if (streamedText.trim()) {
    session.chatHistory.push(new AIMessage(streamedText));
    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    const modelUsed = getLastModelUsed(); // Fix #6: no more global.__last_model_used
    debugLog(`[BACKEND][OUT] Final reply (model: ${modelUsed}, time: ${timeTaken}s): ${streamedText}`);
    clearTimeout(timeoutId);
    sendSSE(res, { final: true, timeTaken, model: modelUsed, attempts: getModelAttempts() }, SSE_EVENTS.DONE);
    return res.end();
  }


  // ✅ Fix 4: Graph fallback now streams tokens via streamEvents() instead of blocking invoke()
  debugLog("[BACKEND] ⚠️ No streamed tokens — falling back to agent graph with token streaming.");

  try {
    let graphStreamedText = "";

    for await (const event of graph.streamEvents(
      { messages: baseMessages },
      { version: "v2", signal: abortController.signal }
    )) {
      // on_chat_model_stream fires for every token from any LLM call inside the graph.
      // Tool-deciding calls produce no text tokens; only the final reply produces text.
      if (event.event === "on_chat_model_stream") {
        const token = extractTextFromContent(event.data?.chunk?.content);
        if (token) {
          graphStreamedText += token;
          sendSSE(res, token, "token");
        }
      }
    }

    if (graphStreamedText.trim()) {
      session.chatHistory.push(new AIMessage(graphStreamedText));
      const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
      const modelUsed = getLastModelUsed(); // Fix #6
      debugLog(`[BACKEND][OUT] Graph stream reply (time: ${timeTaken}s): ${graphStreamedText}`);
      clearTimeout(timeoutId);
      sendSSE(res, { final: true, timeTaken, model: modelUsed, attempts: getModelAttempts() }, SSE_EVENTS.DONE);
    } else {
      clearTimeout(timeoutId);
      sendSSE(res, "Sir, I couldn't generate a response right now.", SSE_EVENTS.FINAL);
      sendSSE(res, { final: true }, SSE_EVENTS.DONE);
    }
    return res.end();
  } catch (graphErr) {
    clearTimeout(timeoutId);
    console.error("[BACKEND][GRAPH ERROR]", graphErr?.message || graphErr);
    sendSSE(res, `Error executing agent graph: ${graphErr?.message || String(graphErr)}`, SSE_EVENTS.ERROR);
    return res.end();
  }
}

/**
 * GET /health - Health check endpoint
 */
export function healthHandler(req, res) {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
