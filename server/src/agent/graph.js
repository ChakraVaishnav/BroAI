import { StateGraph, END } from "@langchain/langgraph";
import { callLLM } from "../llm/groq.js";
import { loadTools } from "../toolLoader/loadTools.js";

function sanitizeMessages(messages = []) {
  return messages.map((message) => {
    if (!message || typeof message !== "object") {
      return message;
    }

    const role = message.role || message._getType?.() || message.type || "assistant";
    const content = typeof message.content === "undefined" ? null : message.content;

    const cleanMessage = {
      role,
      content,
    };

    if (message.name) {
      cleanMessage.name = message.name;
    }

    if (message.tool_call_id) {
      cleanMessage.tool_call_id = message.tool_call_id;
    }

    if (message.tool_calls) {
      cleanMessage.tool_calls = Array.isArray(message.tool_calls)
        ? message.tool_calls.map((toolCall) => ({
            id: toolCall.id,
            type: toolCall.type || "function",
            function: toolCall.function ? {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            } : undefined,
          }))
        : message.tool_calls;
    }

    return cleanMessage;
  });
}

function parseToolCallContent(content, tools) {
  if (typeof content !== "string") {
    return null;
  }

  const toolNames = tools.map((tool) => tool.function?.name).filter(Boolean);

  for (const fnName of toolNames) {
    const patterns = [
      new RegExp(`<function\\s*=\\s*${fnName}\\s*({[\\s\\S]*?})`, "i"),
      new RegExp(`<${fnName}\\s*>(\\{[\\s\\S]*?\\})`, "i"),
      new RegExp(`<${fnName}\\s*\/?>\\s*(\\{[\\s\\S]*?\\})`, "i"),
      new RegExp(`\\b${fnName}\\b[^\\{]*({[\\s\\S]*?})`, "i"),
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (!match) {
        continue;
      }

      try {
        const rawArgs = match[1].replace(/<\/?function>/gi, "").replace(/<\/?[a-zA-Z0-9_]+>$/g, "").trim();
        const parsedArgs = JSON.parse(rawArgs);

        return {
          tool_calls: [
            {
              id: "generated",
              type: "function",
              function: {
                name: fnName,
                arguments: JSON.stringify(parsedArgs),
              },
            },
          ],
        };
      } catch (error) {
        return null;
      }
    }
  }

  return null;
}

export async function buildGraph(options = {}) {
  const record = options.record || (() => {});
  const trace = options.trace || [];
  const onModelMetadata = options.onModelMetadata || (() => {});
  const tools = await loadTools();

  const toolMap = Object.fromEntries(
    tools.map(t => [t.name, t])
  );

  const llmTools = tools.map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));

  // 🧠 STATE
  const graph = new StateGraph({
    channels: {
      messages: [],
      pendingToolCall: null,
    }
  });

  // 🧠 LLM NODE
  graph.addNode("llm", async (state) => {
    const cleanMessages = sanitizeMessages(state.messages);
    let response = await callLLM(cleanMessages, llmTools, { record, trace });
    let pendingToolCall = null;

    if (response.tool_calls?.length) {
      pendingToolCall = response.tool_calls[0];
    } else if (typeof response.content === "string") {
      const parsedToolCall = parseToolCallContent(response.content, llmTools);
      if (parsedToolCall) {
        pendingToolCall = parsedToolCall.tool_calls[0];
      }
    }

    onModelMetadata(response.metadata || null);

    const storedResponse = {
      role: response.role || "assistant",
      content: typeof response.content === "undefined" ? null : response.content,
    };

    return {
      messages: [...state.messages, storedResponse],
      pendingToolCall
    };
  });

  // 🔌 TOOL NODE
  graph.addNode("tool", async (state) => {
    const toolCall = state.pendingToolCall;
    if (!toolCall) return state;

    const toolName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments || "{}");

    const tool = toolMap[toolName];

    const result = await tool.execute(args);

    return {
      messages: [
        ...state.messages,
        {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        },
      ],
      pendingToolCall: null,
    };
  });

  // 🔁 CONDITIONAL EDGE
  graph.addConditionalEdges("llm", (state) => {
    if (state.pendingToolCall) {
      return "tool";
    }

    return END;
  });

  // 🔁 LOOP BACK
  graph.addEdge("tool", "llm");

  graph.setEntryPoint("llm");

  return graph.compile();
}