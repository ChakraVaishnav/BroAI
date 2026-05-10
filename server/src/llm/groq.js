import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";

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

  return {
    async invoke(messages) {
      let lastError = null;
      let sawRateLimit = false;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        
        if (i > 0) {
          console.log('[LLM FALLBACK] Switching to fallback model:', candidate.modelName);
        }

        try {
          const result = await candidate.client.invoke(messages);
          global.__last_model_used = `${candidate.provider} / ${candidate.modelName}`;
          return result;
        } catch (error) {
          lastError = error;
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
  };
}