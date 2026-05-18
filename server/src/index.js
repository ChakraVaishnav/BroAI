/**
 * BroAI Server - Main Entry Point
 * Express server with agent streaming, MCP tools, and safety confirmations
 */
import express from "express";
import dotenv from "dotenv";
import { authMiddleware } from "./middleware/auth.js";
import { chatHandler, initializeChatRoute, healthHandler } from "./routes/chat.js";
import { debugLog } from "./utils/logger.js";
import { PORT } from "./config/constants.js";

dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());

// Middleware
app.use(authMiddleware);

// Routes - Initialize chat dependencies first
await initializeChatRoute();
app.post("/chat", chatHandler);
app.get("/health", healthHandler);

// Server startup
app.listen(PORT, () => {
  const startupMsg = `🚀 [STARTUP] Server running on port ${PORT} with logging enabled`;
  console.log(startupMsg);
  debugLog(startupMsg);
});