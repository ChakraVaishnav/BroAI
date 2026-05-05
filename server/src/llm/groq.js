import "dotenv/config";
import OpenAI from "openai";

const groqClient = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const nvidiaClient = process.env.NVIDIA_API_KEY && process.env.NVIDIA_BASE_URL
  ? new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: process.env.NVIDIA_BASE_URL,
    })
  : null;

const GROQ_MODEL_1 = process.env.GROQ_MODEL_1 || "llama-3.3-70b-versatile";
const GROQ_MODEL_2 = process.env.GROQ_MODEL_2 || "llama-3.1-8b-instant";
const NVIDIA_MODEL = process.env.NVIDIA_PRIMARY_MODEL || null;

function isRateLimitError(error) {
  const msg = String(error?.message || "");
  const status = error?.status || error?.statusCode || null;
  return status === 429 || error?.code === "rate_limit_exceeded" || /rate limit/i.test(msg) || /429/.test(msg);
}

function toIstTimestamp(date) {
  const fmt = date.toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const [datePart, timePart] = fmt.replace(",", "").split(" ");
  const [day, month, year] = datePart.split("/");
  return `${year}-${month}-${day} ${timePart} IST`;
}

function buildRateLimitError(error, modelName) {
  const msg = String(error?.message || "");
  const headers = error?.headers;
  let retryAfterSeconds = null;

  const retryAfterHeader = headers?.get ? headers.get("retry-after") : headers?.["retry-after"] || headers?.retry_after;
  if (retryAfterHeader) {
    const parsed = Number.parseFloat(retryAfterHeader);
    if (!Number.isNaN(parsed)) {
      retryAfterSeconds = parsed;
    }
  }

  if (retryAfterSeconds == null) {
    const match = msg.match(/Please try again in ([0-9]+m[0-9]+(?:\.[0-9]+s)?)/i) || msg.match(/Please try again in ([0-9]+s)/i);
    if (match) {
      const duration = match[1];
      const parts = duration.match(/(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/i);
      if (parts) {
        const mins = parseInt(parts[1] || "0", 10);
        const secs = parseFloat(parts[2] || "0");
        retryAfterSeconds = Math.ceil(mins * 60 + secs);
      }
    }
  }

  const rlError = new Error("Rate limit exceeded for LLM");
  rlError.type = "rate_limit";
  rlError.model = modelName;
  rlError.originalMessage = msg;
  rlError.retryAfterSeconds = retryAfterSeconds;
  rlError.resetAt = retryAfterSeconds ? toIstTimestamp(new Date(Date.now() + retryAfterSeconds * 1000)) : null;
  return rlError;
}

async function callModel(client, model, messages, tools, record, label) {
  record(`trying ${label}`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      tools,
    });

    record(`${label} answered`);
    return response.choices[0].message;
  } catch (error) {
    if (error?.code === "tool_use_failed") {
      record(`${label} tool call format failed`);
      const retryResponse = await client.chat.completions.create({
        model,
        messages: [
          ...messages,
          {
            role: "system",
            content: "Use standard OpenAI tool calls only. Do not output XML tags or inline function syntax.",
          },
        ],
        tools,
      });

      record(`${label} answered after retry`);
      return retryResponse.choices[0].message;
    }

    if (isRateLimitError(error)) {
      record(`${label} failed: rate limit exceeded`);
      throw buildRateLimitError(error, model);
    }

    record(`${label} failed: ${error?.message || "unknown error"}`);
    throw error;
  }
}

export async function callLLM(messages, tools, options = {}) {
  const record = options.record || (() => {});
  const trace = options.trace || [];
  const providers = [
    { name: "groq", client: groqClient, model: GROQ_MODEL_1, label: `groq model 1 (${GROQ_MODEL_1})` },
    { name: "groq", client: groqClient, model: GROQ_MODEL_2, label: `groq model 2 (${GROQ_MODEL_2})` },
  ];

  if (nvidiaClient && NVIDIA_MODEL) {
    providers.push({ name: "nvidia", client: nvidiaClient, model: NVIDIA_MODEL, label: `nvidia model (${NVIDIA_MODEL})` });
  }

  let lastError = null;

  for (const provider of providers) {
    try {
      const message = await callModel(provider.client, provider.model, messages, tools, record, provider.label);
      return {
        ...message,
        metadata: {
          provider: provider.name,
          model: provider.model,
          label: provider.label,
        },
      };
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  const fallbackError = new Error(`Sorry all the ${providers.length} models failed`);
  fallbackError.type = "all_models_failed";
  fallbackError.trace = [...trace];
  fallbackError.lastError = lastError;
  throw fallbackError;
}