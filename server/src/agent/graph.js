import { END, MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { getLlmWithTools } from "../llm/groq.js";
import { callTool, getTools } from "./mcpClient.js";

/**
 * PROBLEM 1 FIX: Logic to parse tool calls from text if the LLM leaks them as text,
 * but primarily we want to ensure the graph handles structured tool_calls correctly.
 */
function parseInlineToolCall(content) {
  if (typeof content !== "string") return null;

  // Pattern: <function=tool_name>{...}</function>
  const funcTagRe = /<function=([a-zA-Z0-9_]+)\s*(\{[\s\S]*?\})\s*>\s*(?:<\/function>)?/;
  const tagged = content.match(funcTagRe);
  if (tagged) {
    try {
      return { name: tagged[1], args: JSON.parse(tagged[2]) };
    } catch {
      return { name: tagged[1], args: { _raw: tagged[2] } };
    }
  }
  return null;
}

export async function buildGraph() {
  const tools = await getTools();
  const llmWithTools = getLlmWithTools(tools);

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agentNode", async (state) => {
      try {
        const response = await llmWithTools.invoke(state.messages);
        
        console.log('[AGENT] tool_calls detected:', response.tool_calls?.length || 0);
        if (response.tool_calls?.length > 0) {
          console.log('[AGENT] tool_calls:', JSON.stringify(response.tool_calls));
        }

        // Handle cases where the LLM might output tool calls as text tags instead of structured calls
        const hasStructuredCalls = Array.isArray(response.tool_calls) && response.tool_calls.length > 0;
        if (!hasStructuredCalls && typeof response.content === "string") {
          const inlineParsed = parseInlineToolCall(response.content);
          if (inlineParsed) {
            const toolCallId = `tc_${Date.now()}`;
            console.log('[AGENT] Detected inline tool call, normalizing to structured call:', inlineParsed.name);
            const normalized = new AIMessage({
              content: "",
              tool_calls: [{ id: toolCallId, name: inlineParsed.name, args: inlineParsed.args, type: "tool_call" }],
            });
            return { messages: [normalized] };
          }
        }

        return { messages: [response] };
      } catch (err) {
        console.error("[AGENT] Error in agentNode:", err);
        throw err;
      }
    })
    .addNode("tools", async (state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const toolCalls = Array.isArray(lastMessage?.tool_calls) ? lastMessage.tool_calls : [];
      const toolMessages = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.name;
        const toolArgs = toolCall.args;
        const toolCallId = toolCall.id;

        console.log('[TOOL CALLED]', toolName, JSON.stringify(toolArgs));

        try {
          const result = await callTool(toolName, toolArgs || {});
          console.log('[TOOL RESULT]', toolName, JSON.stringify(result));
          
          toolMessages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              content: typeof result === "string" ? result : JSON.stringify(result),
            })
          );
        } catch (err) {
          console.error(`[TOOL ERROR] ${toolName} failed:`, err?.message || err);
          toolMessages.push(
            new ToolMessage({
              tool_call_id: toolCallId,
              content: JSON.stringify({ success: false, error: String(err?.message || err) }),
            })
          );
        }
      }

      return { messages: toolMessages };
    })
    .addConditionalEdges("agentNode", (state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      // PROBLEM 1 FIX: Explicitly check for tool_calls length
      if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
        return "tools";
      }
      return END;
    })
    .addEdge("tools", "agentNode")
    .addEdge("__start__", "agentNode");

  return graph.compile();
}