import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildZodShape } from "../utils/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mcpServerEntry = path.resolve(__dirname, "../mcp_server/index.js");

let mcpClient = null;
let connectPromise = null;
let toolCache = null;
let activeTransport = null;
let currentGoogleToken = null;

async function ensureConnected() {
  if (mcpClient && connectPromise) {
    if (process.env.GOOGLE_REFRESH_TOKEN !== currentGoogleToken) {
      console.log("[MCP] 🔄 Google token changed in request, restarting MCP child process to sync env vars.");
      try { await activeTransport?.close(); } catch {}
      mcpClient = null;
      connectPromise = null;
      toolCache = null;
    } else {
      try {
        await connectPromise;
        return mcpClient;
      } catch {
        // Fix #5: MCP subprocess crashed — reset state so next call reconnects cleanly
        console.warn("[MCP] Stored connection failed — resetting for reconnect.");
        mcpClient = null;
        connectPromise = null;
        toolCache = null;
      }
    }
  }

  currentGoogleToken = process.env.GOOGLE_REFRESH_TOKEN;

  mcpClient = new Client(
    { name: "broai-agent-client", version: "1.0.0" },
    { capabilities: {} }
  );

  activeTransport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpServerEntry],
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env },
  });

  connectPromise = mcpClient.connect(activeTransport);
  await connectPromise;
  return mcpClient;
}

export async function callTool(name, args = {}) {
  const client = await ensureConnected();
  let result;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (err) {
    // Fix #5: If the transport died mid-call, reset so next request reconnects
    const msg = String(err?.message || err).toLowerCase();
    if (msg.includes("transport") || msg.includes("closed") || msg.includes("econnrefused")) {
      console.warn(`[MCP] Transport error on callTool('${name}') — resetting connection.`);
      mcpClient = null;
      connectPromise = null;
      toolCache = null;
    }
    throw err;
  }

  if (typeof result?.structuredContent !== "undefined") {
    return result.structuredContent;
  }

  const content = Array.isArray(result?.content) ? result.content : [];
  const textParts = content.filter((item) => item.type === "text").map((item) => item.text).join("\n").trim();

  if (!textParts) {
    return result;
  }

  try {
    return JSON.parse(textParts);
  } catch {
    return textParts;
  }
}

export async function getTools() {
  if (toolCache) {
    return toolCache;
  }

  const client = await ensureConnected();
  const response = await client.listTools();

  toolCache = response.tools.map((tool) => {
  const schema = z.object(buildZodShape(tool.inputSchema)).passthrough();

    return new DynamicStructuredTool({
      name: tool.name,
      description: tool.description || "",
      schema,
      func: async (input) => {
        const result = await callTool(tool.name, input);
        return typeof result === "string" ? result : JSON.stringify(result);
      },
    });
  });

  return toolCache;
}
