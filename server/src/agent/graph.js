import { END, MessagesAnnotation, StateGraph } from "@langchain/langgraph";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { getLlmWithTools } from "../llm/groq.js";
import { callTool, getTools } from "./mcpClient.js";

function parseInlineToolCall(content) {
  if (typeof content !== "string") {
    return null;
  }

  const funcTagRe = /<function=([a-zA-Z0-9_]+)\s*(\{[\s\S]*?\})\s*>\s*(?:<\/function>)?/;
  const tagged = content.match(funcTagRe);
  if (tagged) {
    try {
      return { name: tagged[1], args: JSON.parse(tagged[2]) };
    } catch {
      return { name: tagged[1], args: { _raw: tagged[2] } };
    }
  }

  const simpleRe = /([a-zA-Z0-9_]+)\s*\(\s*(\{[\s\S]*?\})\s*\)/;
  const simple = content.match(simpleRe);
  if (!simple) {
    return null;
  }

  try {
    return { name: simple[1], args: JSON.parse(simple[2]) };
  } catch {
    return { name: simple[1], args: { _raw: simple[2] } };
  }
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

function isMailIntent(text = "") {
  return /\b(mail|mails|email|emails|inbox|gmail|message|messages)\b/i.test(text);
}

function isSendMailIntent(text = "") {
  return /\b(send|compose|draft|write|reply|forward)\b/i.test(text);
}

function isReadMailIntent(text = "") {
  if (!isMailIntent(text)) {
    return false;
  }

  if (isSendMailIntent(text)) {
    return false;
  }

  return /\b(check|read|show|list|fetch|get|last|latest|recent|from|subject|inbox|mail|email)s?\b/i.test(text);
}

function inferMailArgs(text = "") {
  const countMatch = text.match(/\b(?:last|latest|recent)\s+(\d{1,2})\b/i);
  const maxResults = countMatch ? Math.min(Math.max(Number(countMatch[1]) || 5, 1), 20) : 5;

  const fromMatch = text.match(/\bfrom\s+([^\s,?.!]+)/i);
  const subjectMatch = text.match(/\bsubject\s+([^?.!]+)/i);

  let query = "";
  if (fromMatch?.[1]) {
    query = `from:${fromMatch[1]}`;
  } else if (subjectMatch?.[1]) {
    query = `subject:${subjectMatch[1].trim()}`;
  }

  return { maxResults, query };
}

function formatEmailsResponse(result) {
  const emails = Array.isArray(result?.emails) ? result.emails : [];
  if (!emails.length) {
    return "Sir, I couldn't find any emails matching that request.";
  }

  const lines = emails.map((email, idx) => {
    const sender = String(email?.sender || "Unknown sender").trim();
    const subject = String(email?.subject || "(No subject)").trim();
    const snippet = String(email?.snippet || "").trim();
    return `${idx + 1}. From: ${sender}\n   Subject: ${subject}\n   Snippet: ${snippet}`;
  });

  return `Sir, here are your recent emails:\n\n${lines.join("\n\n")}`;
}

export async function buildGraph() {
  const tools = await getTools();
  const llmWithTools = getLlmWithTools(tools);

  const graph = new StateGraph(MessagesAnnotation)
    .addNode("agentNode", async (state) => {
      const userText = getLastUserText(state.messages);

      // Reliability path: answer read-email requests directly via MCP tool.
      if (isReadMailIntent(userText)) {
        try {
          const args = inferMailArgs(userText);
          const result = await callTool("get_emails", args);
          return { messages: [new AIMessage({ content: formatEmailsResponse(result) })] };
        } catch (readErr) {
          console.error("agentNode read-mail direct path failed:", readErr);
          return {
            messages: [
              new AIMessage({
                content: "Sir, I couldn't access Gmail right now. Please verify your Gmail auth environment variables and try again.",
              }),
            ],
          };
        }
      }

      try {
        const aiMessage = await llmWithTools.invoke(state.messages);
        return { messages: [aiMessage] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const lower = message.toLowerCase();
        const fallbackUserText = userText;

        // Fallback for providers that reject generated function tags before tool execution.
        if (lower.includes("tool_use_failed") && isMailIntent(fallbackUserText)) {
          try {
            const args = inferMailArgs(fallbackUserText);
            const result = await callTool("get_emails", args);
            return { messages: [new AIMessage({ content: formatEmailsResponse(result) })] };
          } catch (fallbackErr) {
            console.error("agentNode fallback get_emails failed:", fallbackErr);
            return {
              messages: [
                new AIMessage({
                  content: "Sir, I couldn't access Gmail right now due to a tool-calling error. Please verify Gmail auth env vars and try again.",
                }),
              ],
            };
          }
        }

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