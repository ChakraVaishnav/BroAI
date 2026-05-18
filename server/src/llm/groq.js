import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";

// Module-scoped last-used model tracker (replaces global.__last_model_used)
let _lastModelUsed = "unknown";
export function getLastModelUsed() {
  return _lastModelUsed;
}

// Tracks every provider attempt for the current request (reset each call)
let _modelAttempts = [];
export function getModelAttempts() {
  return _modelAttempts;
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

const PRIMARY_MODEL = "llama-3.3-70b-versatile";
const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";

function isRateLimitError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("rate limit") || message.includes("rate_limit_exceeded") || message.includes("429");
}

function createGroqModel(apiKey) {
  return new ChatGroq({
    apiKey,
    model: PRIMARY_MODEL,
    temperature: 0,
    maxRetries: 0,
  });
}

function createNvidiaModel() {
  if (!process.env.NVIDIA_API_KEY || !process.env.NVIDIA_BASE_URL) {
    return null;
  }

  return new ChatOpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    model: NVIDIA_MODEL,
    temperature: 0,
    configuration: {
      baseURL: `${process.env.NVIDIA_BASE_URL.replace(/\/$/, "")}/v1`,
    },
  });
}

function getCandidateModels() {
  const candidates = [];

  // 1. Groq Primary (GROQ_API_KEY)
  if (process.env.GROQ_API_KEY) {
    candidates.push({ 
      provider: "groqPrimary", 
      modelName: PRIMARY_MODEL, 
      client: createGroqModel(process.env.GROQ_API_KEY) 
    });
  }

  // 2. Groq Backup (GROQ_API_KEY_2)
  if (process.env.GROQ_API_KEY_2) {
    candidates.push({ 
      provider: "groqBackup", 
      modelName: PRIMARY_MODEL, 
      client: createGroqModel(process.env.GROQ_API_KEY_2) 
    });
  }

  // 3. NVIDIA Client (meta/llama-3.3-70b-instruct)
  const nvidiaClient = createNvidiaModel();
  if (nvidiaClient) {
    candidates.push({ 
      provider: "nvidiaClient", 
      modelName: NVIDIA_MODEL, 
      client: nvidiaClient 
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

    // Most LangChain clients return AsyncIterable chunks.
    if (typeof streamResult[Symbol.asyncIterator] === "function") {
      for await (const chunk of streamResult) {
        yield chunk;
      }
      return;
    }

    // Some providers can return a web ReadableStream.
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
      _modelAttempts = []; // reset for this request

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        if (i > 0) {
          console.log('[LLM FALLBACK] Switching to fallback model:', candidate.modelName);
        }

        try {
          const result = await candidate.client.invoke(messages, options);
          _lastModelUsed = `${candidate.provider} / ${candidate.modelName}`;
          _modelAttempts.push({ provider: candidate.provider, model: candidate.modelName, status: "success" });
          return result;
        } catch (error) {
          lastError = error;
          const reason = classifyError(error);
          _modelAttempts.push({ provider: candidate.provider, model: candidate.modelName, status: "failed", reason });
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
      _modelAttempts = []; // reset for this request

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        if (i > 0) {
          console.log("[LLM FALLBACK] Switching to fallback model:", candidate.modelName);
        }

        let emittedAnyChunk = false;
        try {
          const streamResult = await candidate.client.stream(messages, options);
          _lastModelUsed = `${candidate.provider} / ${candidate.modelName}`;

          for await (const chunk of iterateNormalizedStream(streamResult)) {
            if (!emittedAnyChunk) {
              // First chunk — record success now that we know it's working
              _modelAttempts.push({ provider: candidate.provider, model: candidate.modelName, status: "success" });
            }
            emittedAnyChunk = true;
            yield chunk;
          }
          return;
        } catch (error) {
          lastError = error;

          // If stream has already started and then fails, surface the error to caller
          if (emittedAnyChunk) {
            throw error;
          }

          const reason = classifyError(error);
          _modelAttempts.push({ provider: candidate.provider, model: candidate.modelName, status: "failed", reason });

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