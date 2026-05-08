import { END, MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { getLlmWithTools } from "../llm/groq.js";
import { callTool, getTools } from "./mcpClient.js";

function parseInlineToolCall(content) {
  if (typeof content !== "string") {
    return null;
  }

  // Pattern 1: <function=tool_name {...}></function>
  const funcTagRe = /<function=([a-zA-Z0-9_]+)\s*(\{[\s\S]*?\})\s*>\s*(?:<\/function>)?/;
  const tagged = content.match(funcTagRe);
  if (tagged) {
    try {
      return { name: tagged[1], args: JSON.parse(tagged[2]) };
    } catch {
      return { name: tagged[1], args: { _raw: tagged[2] } };
    }
  }

  // Pattern 2: tool_name({...})
  const simpleRe = /([a-zA-Z0-9_]+)\s*\(\s*(\{[\s\S]*?\})\s*\)/;
  const simple = content.match(simpleRe);
  if (simple) {
    try {
      return { name: simple[1], args: JSON.parse(simple[2]) };
    } catch {
      return { name: simple[1], args: { _raw: simple[2] } };
    }
  }

  // Pattern 3: NVIDIA plain JSON format — {"name": "tool_name", "parameters": {...}}
  // Also handles {"name": "tool_name", "arguments": {...}}
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed?.name === "string" && (parsed.parameters || parsed.arguments)) {
        return { name: parsed.name, args: parsed.parameters || parsed.arguments };
      }
    } catch {
      // not valid JSON, ignore
    }
  }

  return null;
}

function getLastUserText(messages = []) {
  const reversed = [...messages].reverse();
  const human = reversed.find((msg) => msg?.getType?.() === "human");
  if (!human) {
    return "";
  }

  if (typeof human.content === "string") {
    return human.content;
  }

  if (Array.isArray(human.content)) {
    return human.content
      .filter((part) => part?.type === "text")
      .map((part) => part.text)
      .join(" ")
      .trim();
  }

  return "";
}

export async function buildGraph() {
  const tools = await getTools();
  const llmWithTools = getLlmWithTools(tools);

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agentNode", async (state) => {
      try {
        const aiMessage = await llmWithTools.invoke(state.messages);

        // Normalize inline tool calls (e.g. NVIDIA returns {"name":"tool","parameters":{...}} in content)
        // into a proper structured AIMessage with tool_calls so Groq doesn't crash on the next turn.
        const hasStructuredCalls = Array.isArray(aiMessage.tool_calls) && aiMessage.tool_calls.length > 0;
        if (!hasStructuredCalls) {
          const inlineParsed = parseInlineToolCall(
            typeof aiMessage.content === "string" ? aiMessage.content : null
          );
          if (inlineParsed) {
            const toolCallId = `tc_${Date.now()}`;
            const normalized = new AIMessage({
              content: "",
              tool_calls: [{ id: toolCallId, name: inlineParsed.name, args: inlineParsed.args, type: "tool_call" }],
            });
            return { messages: [normalized] };
          }
        }

        return { messages: [aiMessage] };
      } catch (err) {


        throw err;
      }
    })
    .addNode("toolNode", async (state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      let toolCalls = Array.isArray(lastMessage?.tool_calls) ? lastMessage.tool_calls : [];

      // If model didn't set structured `tool_calls`, try to parse inline function tags
      // e.g. <function=get_emails {"maxResults":10,"query":""}></function>
      if (!toolCalls.length && typeof lastMessage?.content === "string") {
        const parsedInline = parseInlineToolCall(lastMessage.content);
        if (parsedInline) {
          toolCalls = [parsedInline];
        }
      }

      const toolMessages = [];

      for (const toolCall of toolCalls) {
        // Support multiple tool_call shapes from different LLM outputs:
        // - { name, args }
        // - { function: { name, arguments } }
        // - arguments may be a stringified JSON or an object
        let toolName = toolCall?.name || toolCall?.function?.name || (toolCall?.function && toolCall.function.name) || null;
        let rawArgs = toolCall?.args || toolCall?.arguments || toolCall?.function?.arguments || null;

        // If the tool name is nested in an object, try to extract string value
        if (toolName && typeof toolName === "object") {
          toolName = toolName.name || toolName.value || toolName.text || null;
        }

        let parsedArgs = {};
        if (typeof rawArgs === "string") {
          try {
            parsedArgs = JSON.parse(rawArgs);
          } catch (e) {
            parsedArgs = { _raw: rawArgs };
          }
        } else if (typeof rawArgs === "object" && rawArgs !== null) {
          parsedArgs = rawArgs;
        }

        if (!toolName) {
          console.error("toolNode: missing tool name in tool_call", JSON.stringify(toolCall));
          toolMessages.push(new ToolMessage({ tool_call_id: toolCall.id || "unknown", content: "Error: missing tool name" }));
          continue;
        }

        try {
          const result = await callTool(toolName, parsedArgs || {});
          toolMessages.push(
            new ToolMessage({
              tool_call_id: toolCall.id || toolCall.tool_call_id || "generated",
              content: typeof result === "string" ? result : JSON.stringify(result),
            })
          );
        } catch (err) {
          console.error(`toolNode: callTool(${toolName}) failed:`, err?.message || err);
          toolMessages.push(
            new ToolMessage({
              tool_call_id: toolCall.id || toolCall.tool_call_id || "generated",
              content: JSON.stringify({ success: false, error: String(err?.message || err) }),
            })
          );
        }
      }

      return { messages: toolMessages };
    })
    .addConditionalEdges("agentNode", (state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      const hasToolCalls = Array.isArray(lastMessage?.tool_calls) && lastMessage.tool_calls.length > 0;
      const hasInlineToolCall = Boolean(parseInlineToolCall(lastMessage?.content));
      return hasToolCalls || hasInlineToolCall ? "toolNode" : END;
    })
    .addEdge("toolNode", "agentNode")
    .addEdge("__start__", "agentNode");

  return graph.compile();
}