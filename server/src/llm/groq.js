import "dotenv/config";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";

/**
 * PROBLEM 3 FIX: Use ONLY llama-3.3-70b-versatile.
 * The 8b model is too weak and hallucinates heavily.
 */
const PRIMARY_MODEL = "llama-3.3-70b-versatile";

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

  // Try Groq with Primary Key
  if (process.env.GROQ_API_KEY) {
    candidates.push({ 
      provider: "groq-primary", 
      modelName: PRIMARY_MODEL, 
      client: createGroqModel(process.env.GROQ_API_KEY) 
    });
  }

  // Try Groq with Secondary Key (Backup for rate limits)
  if (process.env.GROQ_API_KEY_2) {
    candidates.push({ 
      provider: "groq-backup", 
      modelName: PRIMARY_MODEL, 
      client: createGroqModel(process.env.GROQ_API_KEY_2) 
    });
  }

  // NVIDIA as last resort (if configured)
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

      throw new Error(lastError ? lastError.message : "No LLM candidates are configured or all failed.");
    },
  };
}