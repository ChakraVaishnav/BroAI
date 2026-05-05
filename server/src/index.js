import express from "express";
import dotenv from "dotenv";
import { appendFileSync } from "fs";
import { runAgent } from "./agent/agent.js";

dotenv.config();

const app = express();
app.use(express.json());

const logError = (msg) => {
  try {
    appendFileSync("./error.log", `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
};

app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
    // 🛡️ Backend Enforcement: Strictly limit history to 10 max
    const trimmedHistory = (history || []).slice(-10);
    console.log(`[CHAT] Received message: "${message}" (${trimmedHistory.length} history messages used)`);

    const result = await runAgent(message, trimmedHistory);
    res.json(result);
  } catch (err) {
    const errorMsg = `ERROR: ${err.message}\nStack: ${err.stack}`;
    console.error(errorMsg);
    logError(errorMsg);
    res.status(500).json({
      response: "Sorry, something went wrong.",
      error: "InternalError",
      message: err?.message || "An internal error occurred",
      trace: [],
      model: null,
      status: "failed",
    });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});