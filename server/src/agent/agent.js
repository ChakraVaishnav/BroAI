import { buildGraph } from "./graph.js";
import { getEmails } from "../google/gmail.js";
import { listEvents } from "../google/calendar.js";
import { readMemory } from "../memory/memory.js";

function summarizeEmails(emails = []) {
  if (!emails.length) {
    return "I couldn't find any recent emails.";
  }

  const lines = emails.map((email, index) => {
    const subject = email.subject || "(no subject)";
    const sender = email.sender || "(unknown sender)";
    const snippet = email.snippet ? `\n   "${email.snippet}..."` : "";
    return `${index + 1}. ${subject} from ${sender} (ID: ${email.id})${snippet}`;
  });

  return `Here are the latest ${emails.length} emails:\n${lines.join("\n")}`;
}

function summarizeEvents(events = []) {
  if (!events.length) {
    return "I couldn't find any matching calendar events.";
  }

  const lines = events.map((event, index) => {
    const title = event.title || "(no title)";
    const start = event.start || "(unknown time)";
    return `${index + 1}. ${title} at ${start} (ID: ${event.id})`;
  });

  return `Here are the matching calendar events:\n${lines.join("\n")}`;
}

function extractCount(text) {
  const match = text.match(/(?:past|last|latest|recent)\s+([0-9]{1,3})/i);
  if (!match) {
    return null;
  }

  return Math.max(1, Math.min(Number(match[1]) || 5, 20));
}

async function tryDirectToolAnswer(userMessage, trace) {
  const normalized = String(userMessage || "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const wantsTime = /\b(time|what time is it|current time|date and time)\b/.test(normalized);
    const mentionsMail = /\b(mail|email|gmail)\b|emails|gmails/.test(normalized);
    const mentionsCalendar = /\b(calendar|calender|event|schedule|agenda|task)\b|events|tasks|calenders/.test(normalized);

  console.log(`[DEBUG] Direct routing checks: wantsTime=${wantsTime}, mentionsMail=${mentionsMail}, mentionsCalendar=${mentionsCalendar}`);

  if (wantsTime && !mentionsMail && !mentionsCalendar) {
    const now = new Date();
    trace.push("using direct time lookup");
    return {
      response: `${now.toLocaleString()} (${now.toISOString()})`,
      trace,
      model: {
        provider: "tool",
        model: "get_time",
        label: "direct time tool",
      },
      status: "ok",
    };
  }

  const isActionOrCreation = /\b(add|create|insert|new|send|write|make|put|delete|remove|clear|cancel|update|change|modify)\b/.test(normalized);
  const wantsBody = /\b(body|content|text|message|what does it say|read it|details)\b/.test(normalized);

  if (mentionsMail && !isActionOrCreation && !wantsBody && /\b(read|get|list|show|check|latest|recent|last|in my|my)\b/.test(normalized)) {
    try {
      trace.push("using direct gmail lookup");
      const count = extractCount(normalized) || (/\blast\s+mail\b/.test(normalized) ? 1 : 5);
      const emails = await getEmails({ limit: count });
      const keywordMatch = normalized.match(/\b(?:about|from|with|regarding)\s+([a-z0-9][a-z0-9\s.-]{1,80})/i);
      const keyword = keywordMatch ? keywordMatch[1].trim() : "";
      const filteredEmails = keyword
        ? (emails.emails || []).filter((email) => {
            const haystack = `${email.subject || ""} ${email.sender || ""} ${email.snippet || ""}`.toLowerCase();
            return haystack.includes(keyword.toLowerCase());
          })
        : (emails.emails || []);

      return {
        response: keyword
          ? (filteredEmails.length
              ? `I found ${filteredEmails.length} matching emails for "${keyword}":\n${filteredEmails.map((email, index) => `${index + 1}. ${email.subject || "(no subject)"} from ${email.sender || "(unknown sender)"}`).join("\n")}`
              : `I couldn't find any emails matching "${keyword}".`)
          : summarizeEmails(emails.emails || []),
        trace,
        model: {
          provider: "tool",
          model: "get_emails",
          label: "direct Gmail tool",
        },
        status: "ok",
      };
    } catch (err) {
      console.error(`[ERROR] Direct Gmail tool failed:`, err.message);
      trace.push(`direct gmail lookup failed: ${err.message}`);
      return {
        response: "I couldn't read your Gmail right now. The Gmail tool failed before the model fallback, so this is a Gmail/auth issue, not an LLM issue.",
        trace,
        model: {
          provider: "tool",
          model: "get_emails",
          label: "direct Gmail tool failed",
        },
        status: "failed",
      };
    }
  }

  if (mentionsCalendar && !isActionOrCreation && /\b(read|get|list|show|check|upcoming|past|yesterday|today|tomorrow|tommorow|schedule|events|event)\b/.test(normalized)) {
    try {
      trace.push("using direct calendar lookup");
      const dateText = /\byesterday\b/.test(normalized)
        ? "yesterday"
        : /\b(tomorrow|tommorow)\b/.test(normalized)
          ? "tomorrow"
          : /\btoday\b/.test(normalized)
            ? "today"
            : undefined;
      const days = extractCount(normalized) || (/\bpast\b/.test(normalized) ? 5 : undefined);
      const events = await listEvents({
        dateText,
        days,
        mode: /\bpast\b/.test(normalized) ? "past" : "upcoming",
      });

      return {
        response: summarizeEvents(events.events || []),
        trace,
        model: {
          provider: "tool",
          model: "list_events",
          label: "direct calendar tool",
        },
        status: "ok",
      };
    } catch (err) {
      console.error(`[ERROR] Direct calendar tool failed:`, err.message);
      trace.push(`direct calendar lookup failed: ${err.message}`);
      return {
        response: "I couldn't read your calendar right now. The calendar tool failed before the model fallback, so this is a calendar/auth issue, not an LLM issue.",
        trace,
        model: {
          provider: "tool",
          model: "list_events",
          label: "direct calendar tool failed",
        },
        status: "failed",
      };
    }
  }

  return null;
}

const systemPrompt = {
  role: "system",
  content: `
You are BroAI — you are not a personal assistant, but my smart and intelligent bro, dawg, man, mentor, instructor, helper, and friend.
STYLE:
- talk naturally (like a sharp friend)
- no fluff, no corporate tone
- keep answers short unless needed

TOOLS:
- use tools for real data (calendar, gmail, web, time)
- never guess external info
- always call tools using valid JSON

FORMAT:
{
  "name": "tool_name",
  "arguments": { ... }
}

RULES:
- NO XML-style tags (like <search> or </function>)
- Use standard JSON tool calls only
- No corporate fluff, stay bro-like
- If a tool fails, explain it naturally

MEMORY RULES (STRICT):
- Store ONLY fundamental user facts: name, identity, core goals, or permanent preferences.
- NEVER store chat explanations, technical code, temporary context, or casual conversation details.
- Use store_memory tool ONLY when user explicitly says "Remember this", "My name is", or "I'm working on [Project Name]".
- If you aren't sure it's a long-term fact, DO NOT store it.
`
};

export async function runAgent(userMessage, chatHistory = []) {
  const trace = [];
  let latestModelMetadata = null;
  const record = (entry) => {
    if (entry) trace.push(entry);
  };

  record("understanding your request");

  const directAnswer = await tryDirectToolAnswer(userMessage, trace);
  if (directAnswer) return directAnswer;

  const graph = await buildGraph({
    record,
    trace,
    onModelMetadata: (metadata) => {
      if (metadata) latestModelMetadata = metadata;
    }
  });

  // ⚡ SMART CONTEXT: Strictly cap history to 10 messages max
  const historyLimit = userMessage.length > 150 ? 5 : 10;
  const recentHistory = (chatHistory || []).slice(-historyLimit);
  
  // 🧠 LONG-TERM MEMORY
  const memory = readMemory();
  const memoryPrompt = {
    role: "system",
    content: `User facts:\n${JSON.stringify(memory)}`
  };

  // Log the ACTUAL context count being sent to LLM
  console.log(`[AGENT] Processing request with ${recentHistory.length} history messages and LTM.`);

  try {
    const result = await graph.invoke({
      messages: [
        systemPrompt,
        memoryPrompt,
        ...recentHistory,
        {
          role: "user",
          content: userMessage
        }
      ]
    });

    const messages = result.messages;
    const finalMessage = messages[messages.length - 1];
    const lastAssistantMessage = [...messages].reverse().find((message) => message?.role === "assistant" && typeof message?.content === "string" && message.content.trim());

    if (!finalMessage || !finalMessage.content) {
      if (lastAssistantMessage) {
        return {
          response: lastAssistantMessage.content,
          trace,
          model: latestModelMetadata,
          status: "ok"
        };
      }

      return {
        response: "Sorry bro, something went wrong. Try again.",
        trace,
        model: null,
        status: "failed"
      };
    }

    return {
      response: finalMessage.content,
      trace,
      model: latestModelMetadata,
      status: "ok"
    };
  } catch (err) {
    if (err?.type === "all_models_failed") {
      return {
        response: "Sorry all the 3 models failed",
        trace: err.trace || trace,
        model: err.lastError?.model ? { model: err.lastError.model } : null,
        status: "failed"
      };
    }

    throw err;
  }
}