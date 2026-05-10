import { getEmails, sendEmail, replyToEmail } from "../../google/gmail.js";

function inferSubject(body = "") {
  const trimmed = String(body || "").trim();
  if (!trimmed) {
    return "No Subject";
  }

  const firstLine = trimmed.split("\n")[0].trim();
  if (!firstLine) {
    return "No Subject";
  }

  return firstLine.slice(0, 80);
}

function filterEmailsByQuery(emails, query) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return emails;
  }

  const fromMatch = normalized.match(/from:([^\s]+)/i);
  if (fromMatch?.[1]) {
    const sender = fromMatch[1].toLowerCase();
    return emails.filter((email) => String(email.sender || "").toLowerCase().includes(sender));
  }

  const subjectMatch = normalized.match(/subject:([^\n]+)/i);
  if (subjectMatch?.[1]) {
    const subject = subjectMatch[1].trim().toLowerCase();
    return emails.filter((email) => String(email.subject || "").toLowerCase().includes(subject));
  }

  return emails.filter((email) => {
    const haystack = `${email.sender || ""} ${email.subject || ""} ${email.snippet || ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

export const gmailTools = [
  {
    name: "send_email",
    description: "Use this tool ONLY when Sir has explicitly said to send an email with a clear instruction like 'send this email', 'send it', or 'go ahead and send'. Do NOT call this tool just because Sir mentioned email in conversation, asked a question about email capability, or described a situation.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Full email body content" },
      },
      required: ["to", "body"],
    },
    execute: async ({ to, subject, body }) => {
      const resolvedSubject = subject || inferSubject(body);
      return sendEmail({ to, subject: resolvedSubject, body });
    },
  },
  {
    name: "reply_to_email",
    description: "Use this tool to reply to an existing email thread. Sir must provide the messageId of the email he wants to reply to. This tool automatically handles the threading, recipient, and 'Re:' subject line. ALWAYS use this when Sir says 'reply to this' or 'tell them...'.",
    inputSchema: {
      type: "object",
      properties: {
        messageId: { type: "string", description: "The ID of the email message to reply to." },
        body: { type: "string", description: "The content of your reply message." },
      },
      required: ["messageId", "body"],
    },
    execute: async ({ messageId, body }) => {
      return replyToEmail({ messageId, body });
    },
  },
  {
    name: "get_emails",
    description: "ALWAYS use this tool when Sir asks about emails, inbox, messages, mail, or anything email-related. You have NO knowledge of Sir's actual emails. Do not answer email questions from memory. Call this tool every single time Sir mentions emails, even if you think you already know the answer.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Gmail search query e.g. 'from:boss@company.com' or 'subject:invoice'. Leave empty to get recent inbox emails.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of emails to return. Default is 5.",
        },
      },
      required: [],
    },
    execute: async ({ query = "", maxResults = 5 } = {}) => {
      const parsedLimit = Math.min(Math.max(Number(maxResults) || 5, 1), 20);
      const fetchLimit = String(query || "").trim() ? 20 : parsedLimit;
      const response = await getEmails({ limit: fetchLimit });
      const filtered = filterEmailsByQuery(response.emails || [], query);
      return {
        ...response,
        emails: filtered.slice(0, parsedLimit),
      };
    },
  },
];
