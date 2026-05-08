import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";

function isRateLimitError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("rate limit") || message.includes("rate_limit_exceeded") || message.includes("429");
}

function createGroqModel(modelName, apiKey = process.env.GROQ_API_KEY) {
  return new ChatGroq({
    apiKey,
    model: modelName,
    temperature: 0,
    maxRetries: 0, // fail fast — let our cascade handle retries
  });
}

function createNvidiaModel() {
  if (!process.env.NVIDIA_API_KEY || !process.env.NVIDIA_BASE_URL || !process.env.NVIDIA_PRIMARY_MODEL) {
    return null;
  }

  return new ChatOpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    model: process.env.NVIDIA_PRIMARY_MODEL,
    temperature: 0,
    configuration: {
      baseURL: `${process.env.NVIDIA_BASE_URL.replace(/\/$/, "")}/v1`,
    },
  });
}

function getCandidateModels() {
  const candidates = [];

  // ── Key 1 (primary) ──────────────────────────────────────────
  if (process.env.GROQ_API_KEY && process.env.GROQ_MODEL_1) {
    candidates.push({ provider: "groq", modelName: process.env.GROQ_MODEL_1, client: createGroqModel(process.env.GROQ_MODEL_1, process.env.GROQ_API_KEY) });
  }
  if (process.env.GROQ_API_KEY && process.env.GROQ_MODEL_2 && process.env.GROQ_MODEL_2 !== process.env.GROQ_MODEL_1) {
    candidates.push({ provider: "groq", modelName: process.env.GROQ_MODEL_2, client: createGroqModel(process.env.GROQ_MODEL_2, process.env.GROQ_API_KEY) });
  }

  // ── Key 2 (fallback when key1 hits rate limit) ───────────────
  if (process.env.GROQ_API_KEY_2 && process.env.GROQ_MODEL_1) {
    candidates.push({ provider: "groq-key2", modelName: process.env.GROQ_MODEL_1, client: createGroqModel(process.env.GROQ_MODEL_1, process.env.GROQ_API_KEY_2) });
  }
  if (process.env.GROQ_API_KEY_2 && process.env.GROQ_MODEL_2 && process.env.GROQ_MODEL_2 !== process.env.GROQ_MODEL_1) {
    candidates.push({ provider: "groq-key2", modelName: process.env.GROQ_MODEL_2, client: createGroqModel(process.env.GROQ_MODEL_2, process.env.GROQ_API_KEY_2) });
  }

  // ── NVIDIA (last resort) ─────────────────────────────────────
  const nvidiaModel = createNvidiaModel();
  if (nvidiaModel) {
    candidates.push({ provider: "nvidia", modelName: process.env.NVIDIA_PRIMARY_MODEL, client: nvidiaModel });
  }

  return candidates;
}

export function getLlmWithTools(tools) {
  const candidates = getCandidateModels().map((candidate) => ({
    ...candidate,
    client: candidate.client.bindTools(tools),
  }));

  return {
    async invoke(messages) {
      let lastError = null;
      let sawRateLimit = false;

      for (const candidate of candidates) {
        console.log(`[LLM] Trying ${candidate.provider} / ${candidate.modelName} ...`);
        try {
          const result = await candidate.client.invoke(messages);
          console.log(`[LLM] ✅ Success with ${candidate.provider} / ${candidate.modelName}`);
          global.__last_model_used = `${candidate.provider} / ${candidate.modelName}`;
          return result;
        } catch (error) {
          lastError = error;
          if (isRateLimitError(error)) {
            sawRateLimit = true;
            console.warn(`[LLM] ⚠️  Rate limit on ${candidate.provider} / ${candidate.modelName} — trying next...`);
            continue;
          }
          console.error(`[LLM] ❌ Error on ${candidate.provider} / ${candidate.modelName}:`, error.message);
          continue;
        }
      }

      if (sawRateLimit) {
        const rateLimitError = new Error("Rate limit exceeded on all configured models.");
        rateLimitError.code = "rate_limit_exceeded";
        rateLimitError.originalError = lastError;
        throw rateLimitError;
      }

      throw new Error(lastError ? lastError.message : "No LLM candidates are configured");
    },
  };
}