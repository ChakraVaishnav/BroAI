/**
 * BroAI Server - Main Entry Point
 * Express server with agent streaming, MCP tools, and safety confirmations
 */
import express from "express";
import dotenv from "dotenv";
import { authMiddleware } from "./middleware/auth.js";
import { chatHandler, initializeChatRoute, healthHandler } from "./routes/chat.js";
import authRouter from "./routes/auth.js";
import { debugLog } from "./utils/logger.js";
import { PORT } from "./config/constants.js";

dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());

// ── Google OAuth routes (no auth required – browser flow) ─────────────────
app.use("/auth", authRouter);

// ── Google Refresh Token middleware ──────────────────────────────────────
// If the mobile app sends X-Google-Refresh-Token, inject it into process.env
// so Gmail/Calendar tools can use it for this request.
app.use((req, res, next) => {
  const token = req.headers["x-google-refresh-token"];
  if (token) {
    process.env.GOOGLE_REFRESH_TOKEN = token;
    debugLog("[BACKEND] 🔑 Using Google refresh token from request header.");
  }
  next();
});

// Middleware
app.use(authMiddleware);

import { getModelsDashboard } from "./llm/provider.js";

// Routes - Initialize chat dependencies first
await initializeChatRoute();
app.post("/chat", chatHandler);
app.get("/health", healthHandler);

app.get("/models/status", (req, res) => {
  res.json({ models: getModelsDashboard() });
});

// Server startup
app.listen(PORT, () => {
  const startupMsg = `🚀 [STARTUP] Server running on port ${PORT} with logging enabled`;
  console.log(startupMsg);
  debugLog(startupMsg);
});