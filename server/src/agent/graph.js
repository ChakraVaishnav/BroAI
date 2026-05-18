import { END, MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { getLlmWithTools } from "../llm/groq.js";
import * as mcpClient from "./mcpClient.js";
import { buildPendingAction, clearPendingAction, getPendingAction, isConfirmationMessage, setPendingAction } from "./pendingAction.js";

const DESTRUCTIVE_TOOLS = [
  "post_to_linkedin",
  "send_email",
  "reply_to_email",
  "delete_linkedin_post",
  "reply_to_linkedin_comment",
  "delete_event",
];

function getLastHumanText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (typeof message?._getType === "function" && message._getType() === "human") {
      return String(message.content || "");
    }
  }
  return "";
}

function parseToolArgs(toolCall) {
  const toolArgs = toolCall.args || toolCall.function?.arguments;
  if (typeof toolArgs === "string") {
    try {
      return JSON.parse(toolArgs);
    } catch {
      return {};
    }
  }
  return toolArgs || {};
}

function isSuccessResult(result) {
  return Boolean(result && typeof result === "object" && result.success === true);
}

function shouldContinue(state) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  
  if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "safety_check";
  }
  
  if (lastMessage.additional_kwargs?.tool_calls?.length > 0) {
    return "safety_check";
  }

  return "__end__";
}

/**
 * MANDATORY SAFETY NODE
 * This node intercepts tool calls BEFORE they reach the tools.
 */
async function safetyCheckNode(state) {
  const messages = state.messages;
  const lastAiMessage = messages[messages.length - 1];
  const toolCalls = lastAiMessage.tool_calls || lastAiMessage.additional_kwargs?.tool_calls || [];
  const lastHumanText = getLastHumanText(messages);
  const pendingAction = getPendingAction();

  const safetyResults = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.name || toolCall.function?.name;
    
    if (DESTRUCTIVE_TOOLS.includes(toolName)) {
      const parsedArgs = parseToolArgs(toolCall);
      const isConfirming = pendingAction
        && pendingAction.toolName === toolName
        && isConfirmationMessage(lastHumanText, pendingAction);

      if (isConfirming) {
        continue;
      }

      const nextPending = buildPendingAction(toolName, parsedArgs);
      setPendingAction(nextPending);

      console.warn(`[SAFETY] Blocked destructive tool '${toolName}' awaiting explicit confirmation.`);
      safetyResults.push(new ToolMessage({
        content: nextPending.preview,
        tool_call_id: toolCall.id,
        name: toolName,
      }));
    }
  }

  // If we have safety errors, return them to the messages
  if (safetyResults.length > 0) {
    return { messages: safetyResults };
  }

  // Otherwise, return nothing (safe to proceed)
  return { messages: [] };
}

async function toolNode(state) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1];
  const pendingAction = getPendingAction();
  const lastHumanText = getLastHumanText(messages);
  
  const toolCalls = lastMessage.tool_calls?.length > 0
    ? lastMessage.tool_calls
    : lastMessage.additional_kwargs?.tool_calls || [];

  const toolResults = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const toolName = toolCall.name || toolCall.function?.name;
      const parsedArgs = parseToolArgs(toolCall);
      const shouldUsePending = pendingAction
        && pendingAction.toolName === toolName
        && isConfirmationMessage(lastHumanText, pendingAction);
      const effectiveArgs = shouldUsePending ? pendingAction.args : parsedArgs;

      console.log('[TOOL EXECUTING]', toolName, JSON.stringify(effectiveArgs));

      try {
        const result = await mcpClient.callTool(toolName, effectiveArgs || {});
        console.log('[TOOL RESULT]', toolName, JSON.stringify(result).substring(0, 200));

        if (shouldUsePending && isSuccessResult(result)) {
          clearPendingAction();
        }
        
        return new ToolMessage({
          content: typeof result === 'string' ? result : JSON.stringify(result),
          tool_call_id: toolCall.id,
          name: toolName,
        });
      } catch (error) {
        console.error('[TOOL ERROR]', toolName, error.message);
        return new ToolMessage({
          content: `Tool ${toolName} failed: ${error.message}`,
          tool_call_id: toolCall.id,
          name: toolName,
        });
      }
    })
  );

  return { messages: toolResults };
}

export async function buildGraph() {
  const tools = await mcpClient.getTools();
  const llmWithTools = getLlmWithTools(tools);

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agentNode", async (state) => {
      try {
        const response = await llmWithTools.invoke(state.messages);
        return { messages: [response] };
      } catch (err) {
        console.error("[AGENT ERROR]", err);
        throw err;
      }
    })
    .addNode("safety_check", safetyCheckNode)
    .addNode("tools", toolNode)
    .addConditionalEdges("agentNode", shouldContinue)
    .addConditionalEdges("safety_check", (state) => {
       const lastMessage = state.messages[state.messages.length - 1];
       // If the last message is a ToolMessage, it means the safety check failed and added an error message.
       // In that case, we go back to the agent to explain the error.
       // Otherwise, it's safe to proceed to the actual tool execution.
       return (lastMessage instanceof ToolMessage) ? "agentNode" : "tools";
    })
    .addEdge("tools", "agentNode")
    .addEdge("__start__", "agentNode");

  return graph.compile();
}