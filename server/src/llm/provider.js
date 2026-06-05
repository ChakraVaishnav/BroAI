import "dotenv/config";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";

// Module-scoped last-used model tracker
let _lastModelUsed = "unknown";
export function getLastModelUsed() {
  return _lastModelUsed;
}

// Tracks every provider attempt for the current request (reset each call)
let _modelAttempts = [];
export function getModelAttempts() {
  return _modelAttempts;
}

// Global model statuses for detailed dashboard
export const modelStatuses = {
  geminiPrimary: { status: "Active", cooldownUntil: null, providerName: "Google Gemini", modelName: "gemini-2.5-flash" },
  geminiFallback: { status: "Standby", cooldownUntil: null, providerName: "Google Gemini", modelName: "gemini-flash-latest" },
  groqPrimary: { status: "Standby", cooldownUntil: null, providerName: "Groq", modelName: "llama-3.3-70b-versatile" },
  groqFallback: { status: "Standby", cooldownUntil: null, providerName: "Groq", modelName: "llama3-8b-8192" },
};

export function getModelsDashboard() {
  const now = Date.now();
  return Object.keys(modelStatuses).map(key => {
    const s = modelStatuses[key];
    if (s.cooldownUntil && s.cooldownUntil > now) {
      return { ...s, id: key, remainingMs: s.cooldownUntil - now };
    }
    // If cooldown expired, revert to active/standby
    if (s.status === "Rate Limited" || s.status === "High Demand") {
      s.status = key === "geminiPrimary" ? "Active" : "Standby";
      s.cooldownUntil = null;
    }
    return { ...s, id: key, remainingMs: null };
  });
}

function parseCooldown(errorMsg) {
  const match = errorMsg.match(/retryDelay"?:\s*"(\d+)s"/i);
  if (match && match[1]) {
    return parseInt(match[1], 10) * 1000;
  }
  // Default to 60 seconds if we hit a rate limit but can't find a delay
  if (errorMsg.toLowerCase().includes("503") || errorMsg.toLowerCase().includes("high demand")) {
    return 120000; // 2 minutes for 503
  }
  return 60000;
}

function updateModelError(providerKey, errorMsg) {
  const lower = errorMsg.toLowerCase();
  const cooldownMs = parseCooldown(errorMsg);
  
  if (lower.includes("rate limit") || lower.includes("rate_limit_exceeded") || lower.includes("429")) {
    modelStatuses[providerKey].status = "Rate Limited";
    modelStatuses[providerKey].cooldownUntil = Date.now() + cooldownMs;
  } else if (lower.includes("503") || lower.includes("high demand")) {
    modelStatuses[providerKey].status = "High Demand";
    modelStatuses[providerKey].cooldownUntil = Date.now() + cooldownMs;
  } else {
    modelStatuses[providerKey].status = "Error";
    modelStatuses[providerKey].cooldownUntil = Date.now() + 30000; // short cooldown for other errors
  }
}

function classifyError(error) {
  const msg = String(error?.message || error || "");
  const lower = msg.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("rate_limit_exceeded") || lower.includes("429")) {
    return `Rate limit (429)`;
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return `Timeout`;
  }
  if (lower.includes("network") || lower.includes("econnrefused") || lower.includes("enotfound")) {
    return `Network error`;
  }
  // Generic — truncate to keep it readable in UI
  return msg.length > 80 ? msg.slice(0, 77) + "..." : msg || "Unknown error";
}

const PRIMARY_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-flash-latest";

function isRateLimitError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("rate limit") || message.includes("rate_limit_exceeded") || message.includes("429") || message.includes("resource exhausted");
}

function createGeminiModel(apiKey, modelName) {
  return new ChatGoogleGenerativeAI({
    apiKey,
    model: modelName,
    temperature: 0,
    maxRetries: 0,
  });
}

function getCandidateModels() {
  const candidates = [];
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set in environment variables.");
    return candidates;
  }

  // 1. Primary Model: gemini-2.0-flash (fast, tool-capable)
  candidates.push({ 
    provider: "geminiPrimary", 
    modelName: PRIMARY_MODEL, 
    client: createGeminiModel(apiKey, PRIMARY_MODEL) 
  });

  // 2. Fallback Model: gemini-1.5-pro (larger, heavy-duty)
  candidates.push({ 
    provider: "geminiFallback", 
    modelName: FALLBACK_MODEL, 
    client: createGeminiModel(apiKey, FALLBACK_MODEL) 
  });

  // 3. Optional Fallback: Groq Primary
  const groqApiKey = process.env.GROQ_API_KEY;
  if (groqApiKey) {
    candidates.push({
      provider: "groqPrimary",
      modelName: "llama-3.3-70b-versatile",
      client: new ChatGroq({
        apiKey: groqApiKey,
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        maxRetries: 0,
      })
    });

    candidates.push({
      provider: "groqFallback",
      modelName: "llama3-8b-8192",
      client: new ChatGroq({
        apiKey: groqApiKey,
        model: "llama3-8b-8192",
        temperature: 0,
        maxRetries: 0,
      })
    });
  }

  return candidates;
}

export function getLlmWithTools(tools) {
  const candidates = getCandidateModels().map((candidate) => ({
    ...candidate,
    client: candidate.client.bindTools(tools),
  }));

  async function* iterateNormalizedStream(streamResult) {
    if (!streamResult) {
      throw new Error("LLM stream returned empty result.");
    }

    if (typeof streamResult[Symbol.asyncIterator] === "function") {
      for await (const chunk of streamResult) {
        yield chunk;
      }
      return;
    }

    if (typeof streamResult.getReader === "function") {
      const reader = streamResult.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        yield value;
      }
      return;
    }

    throw new Error("LLM stream is not async iterable.");
  }

  return {
    async invoke(messages, options = {}) {
      let lastError = null;
      let sawRateLimit = false;
      _modelAttempts = [];

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        if (i > 0) {
          console.log('[LLM FALLBACK] Switching to fallback model:', candidate.modelName);
        }

        // Groq complains if AIMessage content is an empty array or weird object from Gemini
        let safeMessages = messages;
        if (candidate.provider.startsWith("groq")) {
          safeMessages = messages.map(msg => {
            if (msg.constructor.name === "AIMessage" && msg.tool_calls && msg.tool_calls.length > 0) {
              if (Array.isArray(msg.content) && msg.content.length === 0) {
                // Return a new AIMessage with content as empty string to satisfy Groq
                const newMsg = new msg.constructor({ ...msg });
                newMsg.content = "";
                return newMsg;
              }
            }
            return msg;
          });
        }

        try {
          const result = await candidate.client.invoke(safeMessages, options);
          _lastModelUsed = `${candidate.provider} / ${candidate.modelName}`;
          _modelAttempts.push({ provider: candidate.provider, model: candidate.modelName, status: "success" });
          modelStatuses[candidate.provider].status = candidate.provider === "geminiPrimary" ? "Active" : "Standby";
          modelStatuses[candidate.provider].cooldownUntil = null;
          return result;
        } catch (error) {
          lastError = error;
          const reason = classifyError(error);
          _modelAttempts.push({ provider: candidate.provider, model: candidate.modelName, status: "failed", reason });
          
          updateModelError(candidate.provider, error.message);

          if (isRateLimitError(error)) {
            sawRateLimit = true;
            console.warn(`[LLM] Rate limit on ${candidate.provider} — trying next candidate...`);
            continue;
          }
          console.error(`[LLM] Error on ${candidate.provider}:`, error.message);
          continue;
        }
      }

      if (sawRateLimit) {
        const rateLimitError = new Error("Rate limit exceeded on all configured models.");
        rateLimitError.code = "rate_limit_exceeded";
        rateLimitError.originalError = lastError;
        throw rateLimitError;
      }

      throw new Error(lastError ? lastError.message : "No LLM candidates configured or all failed.");
    },

    async *stream(messages, options = {}) {
      let lastError = null;
      let sawRateLimit = false;
      _modelAttempts = [];

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        if (i > 0) {
          console.log("[LLM FALLBACK] Switching to fallback model:", candidate.modelName);
        }

        let safeMessages = messages;
        if (candidate.provider.startsWith("groq")) {
          safeMessages = messages.map(msg => {
            if (msg.constructor.name === "AIMessage" && msg.tool_calls && msg.tool_calls.length > 0) {
              if (Array.isArray(msg.content) && msg.content.length === 0) {
                const newMsg = new msg.constructor({ ...msg });
                newMsg.content = "";
                return newMsg;
              }
            }
            return msg;
          });
        }

        let emittedAnyChunk = false;
        try {
          const streamResult = await candidate.client.stream(safeMessages, options);
          _lastModelUsed = `${candidate.provider} / ${candidate.modelName}`;

          for await (const chunk of iterateNormalizedStream(streamResult)) {
            if (!emittedAnyChunk) {
              _modelAttempts.push({ provider: candidate.provider, model: candidate.modelName, status: "success" });
              modelStatuses[candidate.provider].status = candidate.provider === "geminiPrimary" ? "Active" : "Standby";
              modelStatuses[candidate.provider].cooldownUntil = null;
            }
            emittedAnyChunk = true;
            yield chunk;
          }
          return;
        } catch (error) {
          lastError = error;

          if (emittedAnyChunk) {
            throw error;
          }

          const reason = classifyError(error);
          _modelAttempts.push({ provider: candidate.provider, model: candidate.modelName, status: "failed", reason });
          
          updateModelError(candidate.provider, error.message);

          if (isRateLimitError(error)) {
            sawRateLimit = true;
            console.warn(`[LLM] Rate limit on ${candidate.provider} (stream) — trying next candidate...`);
            continue;
          }

          console.error(`[LLM] Stream error on ${candidate.provider}:`, error.message);
          continue;
        }
      }

      if (sawRateLimit) {
        const rateLimitError = new Error("Rate limit exceeded on all configured models.");
        rateLimitError.code = "rate_limit_exceeded";
        rateLimitError.originalError = lastError;
        throw rateLimitError;
      }

      throw new Error(lastError ? lastError.message : "No LLM candidates configured or all failed.");
    },
  };
}
