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
    description: "Send an email from Sir's Gmail. Call ONLY after Sir has seen the full draft AND confirmed with: \"Send it\" / \"Go ahead\" / \"Send the email\" / \"Confirm\" / \"Do it\". Never call this just because Sir mentioned email in conversation.",
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
    description: "Reply to an existing Gmail thread. Requires messageId from get_emails. Handles threading automatically. Call ONLY after Sir confirms the draft.",
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
    description: "Fetch Sir's Gmail inbox. Call every single time Sir mentions emails, inbox, messages, or anything mail-related. You have no knowledge of Sir's actual emails — do not answer from memory. maxResults must be a number (integer), not a string.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Gmail search query e.g. 'from:boss@company.com' or 'subject:invoice'. Leave empty to get recent inbox emails.",
        },
        maxResults: {
          type: "integer",
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
