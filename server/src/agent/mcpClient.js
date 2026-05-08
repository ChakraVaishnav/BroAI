import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mcpServerEntry = path.resolve(__dirname, "../mcp_server/index.js");

let mcpClient = null;
let connectPromise = null;
let toolCache = null;

function jsonSchemaToZod(schema = {}) {
  if (!schema || schema.type !== "object") {
    return z.object({}).passthrough();
  }

  const properties = schema.properties || {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);

  const shape = {};

  for (const [key, fieldSchema] of Object.entries(properties)) {
    let zodField;

    switch (fieldSchema?.type) {
      case "number":
        zodField = z.number();
        break;
      case "integer":
        zodField = z.number().int();
        break;
      case "boolean":
        zodField = z.boolean();
        break;
      case "array":
        zodField = z.array(z.any());
        break;
      case "object":
        zodField = z.record(z.any());
        break;
      case "string":
      default:
        zodField = z.string();
        break;
    }

    if (fieldSchema?.description) {
      zodField = zodField.describe(fieldSchema.description);
    }

    if (!required.has(key)) {
      zodField = zodField.optional();
    }

    shape[key] = zodField;
  }

  return z.object(shape).passthrough();
}

async function ensureConnected() {
  if (mcpClient && connectPromise) {
    await connectPromise;
    return mcpClient;
  }

  mcpClient = new Client(
    {
      name: "broai-agent-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpServerEntry],
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
    },
  });

  connectPromise = mcpClient.connect(transport);
  await connectPromise;

  return mcpClient;
}

export async function callTool(name, args = {}) {
  const client = await ensureConnected();
  const result = await client.callTool({ name, arguments: args });

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
    const schema = jsonSchemaToZod(tool.inputSchema);

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
