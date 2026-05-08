import express from "express";
import dotenv from "dotenv";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { buildGraph } from "./agent/graph.js";
import { SYSTEM_PROMPT } from "./agent/prompts/system.js";
import { readMemory } from "./memory/memory.js";

dotenv.config();

const app = express();
app.use(express.json());

const graph = await buildGraph();
const startupMemory = readMemory();

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Request body must include a non-empty message string" });
    }

    const todayContext = `Today is ${new Date().toDateString()}.`;
    const memoryContext = `Persistent memory context: ${JSON.stringify(startupMemory)}`;

    const result = await graph.invoke({
      messages: [
        new SystemMessage(SYSTEM_PROMPT),
        new SystemMessage(memoryContext),
        new SystemMessage(todayContext),
        new HumanMessage(message),
      ],
    });

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
    }

    return res.json({ reply });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(err);
    console.error(message);
    if (err && err.stack) console.error(err.stack);
    return res.status(500).json({ reply: "Sir, something went wrong while processing your request." });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});