import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { buildGraph } from "./agent/graph.js";
import { SYSTEM_PROMPT } from "./agent/prompts/system.js";
import { readMemory } from "./memory/memory.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFile = path.join(__dirname, "error.log");

function logError(msg) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${msg}\n`);
  console.error(msg);
}

function isRateLimitError(err) {
  const message = String(err?.message || err || "").toLowerCase();
  return message.includes("rate limit") || message.includes("rate_limit_exceeded") || message.includes("429");
}

const app = express();
app.use(express.json());

const graph = await buildGraph();
const startupMemory = readMemory();

// Store the last 20 messages (10 interactions: 10 User + 10 AI)
let chatHistory = [];

app.post("/chat", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.BRO_AI_SECRET_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      console.log("[BACKEND] ❌ Unauthorized request blocked.");
      return res.status(401).json({ reply: "Unauthorized. Invalid or missing secret token." });
    }

    const { message } = req.body;
    console.log(`\n[BACKEND] 🚀 Received request: "${message}"`);

    if (!message) {
      console.log("[BACKEND] ❌ Missing message");
      return res.status(400).json({ reply: "Message is required" });
    }

    const todayContext = `The current system date and time is: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "long" })}`;
    const memoryContext = `Persistent memory context: ${JSON.stringify(startupMemory)}`;

    const startTime = Date.now();

    // Add the new user message to the history
    chatHistory.push(new HumanMessage(message));

    // Keep only the last 10 messages to strictly limit memory
    if (chatHistory.length > 10) {
      chatHistory = chatHistory.slice(-10);
    }

    const abortController = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) {
        console.log("[BACKEND] 🛑 Client disconnected prematurely, aborting generation...");
        abortController.abort();
      }
    });

    const result = await graph.invoke({
      messages: [
        new SystemMessage(SYSTEM_PROMPT),
        new SystemMessage(memoryContext),
        new SystemMessage(todayContext),
        ...chatHistory,
      ],
    }, { signal: abortController.signal });

    const messages = Array.isArray(result?.messages) ? result.messages : [];
    const finalAiMessage = [...messages].reverse().find((msg) => msg instanceof AIMessage);

    let reply = "Sir, I couldn't generate a response right now.";
    if (finalAiMessage) {
      if (typeof finalAiMessage.content === "string") {
        reply = finalAiMessage.content;
      } else if (Array.isArray(finalAiMessage.content)) {
        reply = finalAiMessage.content
          .filter((part) => part?.type === "text")
          .map((part) => part.text)
          .join("\n")
          .trim() || reply;
      }
      
      // Save the AI's response to the history so it remembers what it said
      chatHistory.push(new AIMessage(reply));
    }

    const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
    const modelUsed = global.__last_model_used || "unknown";

    const formattedReply = `${reply}\n\n[Time: ${timeTaken}s | Model: ${modelUsed}]`;

    console.log(`[BACKEND] ✅ Sending successful reply. Time: ${timeTaken}s`);
    return res.json({ reply: formattedReply });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    logError("=== ERROR ===");
    logError(errorMessage);
    logError((err && err.stack) || "no stack");
    logError("===== END =====");

    if (isRateLimitError(err)) {
      return res.status(429).json({ reply: "Rate limit exceeded on all available models. Please try again later." });
    }

    // Return the exact error to the user
    return res.status(500).json({ reply: `Error: ${errorMessage}` });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});