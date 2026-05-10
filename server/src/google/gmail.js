import { google } from "googleapis";
import { getAuthClient } from "./auth.js";

function withTimeout(promise, label, timeoutMs = 15000) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function getGmailClient() {
  const auth = getAuthClient();
  return google.gmail({ version: "v1", auth });
}

function getHeader(headers, name) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

export async function getEmails({ limit = 5 } = {}) {
  const gmail = getGmailClient();

  const maxResults = Math.min(Math.max(Number(limit) || 5, 1), 20);

  const listResponse = await withTimeout(
    gmail.users.messages.list({
      userId: "me",
      maxResults
    }),
    "Gmail list request"
  );

  const messages = listResponse.data.messages || [];

  const emails = await Promise.all(
    messages.map(async (message) => {
      const detail = await withTimeout(
        gmail.users.messages.get({
          userId: "me",
          id: message.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject"]
        }),
        `Gmail message fetch ${message.id}`
      );

      const headers = detail.data.payload?.headers || [];

      return {
        id: detail.data.id,
        sender: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        snippet: detail.data.snippet || ""
      };
    })
  );

  return {
    success: true,
    emails
  };
}

export async function sendEmail({ to, subject, body }) {
  const gmail = getGmailClient();

  const message = [
    `To: ${to}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    `Subject: ${subject}`,
    "",
    body
  ].join("\n");

  const raw = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw }
  });

  return {
    success: true,
    messageId: response.data.id
  };
}

export async function replyToEmail({ messageId, body }) {
  const gmail = getGmailClient();

  const original = await withTimeout(
    gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "Subject", "From", "References"]
    }),
    `Fetch original email ${messageId}`
  );

  const headers = original.data.payload?.headers || [];
  const threadId = original.data.threadId;
  const originalMsgId = getHeader(headers, "Message-ID");
  const originalSubject = getHeader(headers, "Subject");
  const originalFrom = getHeader(headers, "From");
  const originalReferences = getHeader(headers, "References");

  const subject = originalSubject.toLowerCase().startsWith("re:") 
    ? originalSubject 
    : `Re: ${originalSubject}`;

  const to = originalFrom;
  const references = originalReferences 
    ? `${originalReferences} ${originalMsgId}` 
    : originalMsgId;

  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${originalMsgId}`,
    `References: ${references}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    body
  ].join("\n");

  const raw = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId }
  });

  return {
    success: true,
    messageId: response.data.id,
    threadId: response.data.threadId
  };
}