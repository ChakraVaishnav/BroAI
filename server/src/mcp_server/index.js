import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { gmailTools } from "./tools/gmail.js";
import { calendarTools } from "./tools/calendar.js";
import { searchTools } from "./tools/search.js";
import { memoryTools } from "./tools/memory.js";
import { systemTools } from "./tools/system.js";
import { supabaseTools } from "./tools/supabase.js";
import { linkedinTools } from "./tools/linkedin.js";
import { buildZodShape } from "../utils/schema.js";


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
  const rawShape = buildZodShape(tool.inputSchema);

  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: rawShape,
    },
    async (args) => {
      try {
        const result = await tool.execute(args || {});
        
        // Final fallback to ensure the response is ALWAYS an object for the SDK
        // and ALWAYS has a text content part for the LLM.
        const response = {
          content: [
            {
              type: "text",
              text: typeof result === "string" ? result : JSON.stringify(result),
            },
          ],
        };

        // ONLY include structuredContent if it's a valid object (record)
        if (result && typeof result === "object" && !Array.isArray(result)) {
          response.structuredContent = result;
        }

        return response;
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Tool execution failed: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
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
