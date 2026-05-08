import { getEmails, sendEmail } from "../../google/gmail.js";

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
    description:
      "Sends an email via Gmail. Use this when the user wants to send, compose, or write an email to someone. Requires recipient email address and the content/body of the email. Subject is optional — infer it from context if not provided.",
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
    name: "get_emails",
    description:
      "Reads and fetches emails from Gmail inbox. Use this when the user asks to check emails, read messages, see what emails arrived, or look for a specific email from someone. Can filter by sender or keyword. Returns recent emails by default.",
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
