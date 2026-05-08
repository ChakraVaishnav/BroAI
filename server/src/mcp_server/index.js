import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { gmailTools } from "./tools/gmail.js";
import { calendarTools } from "./tools/calendar.js";
import { searchTools } from "./tools/search.js";
import { memoryTools } from "./tools/memory.js";
import { systemTools } from "./tools/system.js";
import { supabaseTools } from "./tools/supabase.js";

import { linkedinTools } from "./tools/linkedin.js";

function jsonSchemaToRawShape(schema = {}) {
  if (!schema || schema.type !== "object") {
    return {};
  }

  const properties = schema.properties || {};
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const shape = {};

  for (const [key, fieldSchema] of Object.entries(properties)) {
    let field;

    switch (fieldSchema?.type) {
      case "number":
        field = z.number();
        break;
      case "integer":
        field = z.number().int();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.any());
        break;
      case "object":
        field = z.record(z.any());
        break;
      case "string":
      default:
        field = z.string();
        break;
    }

    if (fieldSchema?.description) {
      field = field.describe(fieldSchema.description);
    }

    if (!required.has(key)) {
      field = field.optional();
    }

    shape[key] = field;
  }

  return shape;
}

const server = new McpServer({
  name: "broai-mcp-server",
  version: "1.0.0",
});

const allTools = [
  ...gmailTools,
  ...calendarTools,
  ...searchTools,
  ...memoryTools,
  ...systemTools,
  ...supabaseTools,

  ...linkedinTools,
];

for (const tool of allTools) {
  const rawShape = jsonSchemaToRawShape(tool.inputSchema);

  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: rawShape,
    },
    async (args) => {
      const result = await tool.execute(args || {});
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
        structuredContent: result,
      };
    }
  );
}

const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start MCP server: ${message}`);
  process.exit(1);
}
