const pendingState = {
  action: null,
};

const DRAFT_REQUEST_PHRASES = [
  "show the content",
  "what is the content",
  "show the draft",
  "show draft",
  "show me the draft",
  "what did you write",
  "what did you prepare",
  "show me what you wrote",
  "preview",
  "show email",
  "email content",
  "show the email",
  "show post",
  "post content",
  "show the post",
];

const CANCEL_PHRASES = [
  "cancel",
  "never mind",
  "nevermind",
  "stop",
  "don't send",
  "do not send",
  "dont send",
  "don't post",
  "do not post",
  "dont post",
  "no",
  "nope",
];

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function stringifyValue(value) {
  if (value === null || typeof value === "undefined") {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function inferSubjectFromBody(body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) {
    return "(auto from body)";
  }
  const firstLine = trimmed.split("\n")[0].trim();
  if (!firstLine) {
    return "(auto from body)";
  }
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function buildEmailPreview(args) {
  const to = args?.to ? stringifyValue(args.to) : "(missing)";
  const subject = args?.subject ? stringifyValue(args.subject) : inferSubjectFromBody(args?.body);
  const body = args?.body ? stringifyValue(args.body) : "(empty)";

  return [
    "EMAIL DRAFT",
    `To: ${to}`,
    `Subject: ${subject}`,
    "Body:",
    body,
    "",
    "Sir, should I send this email? (Yes/No)",
  ].join("\n");
}

function buildEmailReplyPreview(args) {
  const messageId = args?.messageId ? stringifyValue(args.messageId) : "(missing)";
  const body = args?.body ? stringifyValue(args.body) : "(empty)";

  return [
    "EMAIL REPLY DRAFT",
    `MessageId: ${messageId}`,
    "Body:",
    body,
    "",
    "Sir, should I send this email reply? (Yes/No)",
  ].join("\n");
}

function buildLinkedInPostPreview(args) {
  const content = args?.content ? stringifyValue(args.content) : "(empty)";
  return [
    "LINKEDIN POST DRAFT",
    content,
    "",
    "Sir, should I post this on LinkedIn? (Yes/No)",
  ].join("\n");
}

function buildLinkedInReplyPreview(args) {
  const postId = args?.postId ? stringifyValue(args.postId) : "(missing)";
  const commentId = args?.commentId ? stringifyValue(args.commentId) : "(missing)";
  const text = args?.text ? stringifyValue(args.text) : "(empty)";

  return [
    "LINKEDIN REPLY DRAFT",
    `PostId: ${postId}`,
    `CommentId: ${commentId}`,
    "Reply:",
    text,
    "",
    "Sir, should I post this reply? (Yes/No)",
  ].join("\n");
}

function buildLinkedInDeletePreview(args) {
  const postId = args?.postId ? stringifyValue(args.postId) : "(missing)";
  return [
    "LINKEDIN DELETE REQUEST",
    `PostId: ${postId}`,
    "",
    "Sir, should I delete this post? (Yes/No)",
  ].join("\n");
}

function buildCalendarDeletePreview(args) {
  const eventId = args?.eventId ? stringifyValue(args.eventId) : "(missing)";
  return [
    "CALENDAR DELETE REQUEST",
    `EventId: ${eventId}`,
    "",
    "Sir, should I delete this event? (Yes/No)",
  ].join("\n");
}

function buildGenericPreview(toolName, args) {
  const payload = stringifyValue(args);
  return [
    "ACTION PREVIEW",
    `Tool: ${toolName}`,
    "Payload:",
    payload,
    "",
    "Sir, should I proceed? (Yes/No)",
  ].join("\n");
}

function buildPreview(toolName, args) {
  switch (toolName) {
    case "send_email":
      return buildEmailPreview(args);
    case "reply_to_email":
      return buildEmailReplyPreview(args);
    case "post_to_linkedin":
      return buildLinkedInPostPreview(args);
    case "reply_to_linkedin_comment":
      return buildLinkedInReplyPreview(args);
    case "delete_linkedin_post":
      return buildLinkedInDeletePreview(args);
    case "delete_event":
      return buildCalendarDeletePreview(args);
    default:
      return buildGenericPreview(toolName, args);
  }
}

function getConfirmTokens(toolName) {
  if (toolName === "send_email" || toolName === "reply_to_email") {
    return [
      "yes",
      "ok",
      "okay",
      "confirm",
      "send it",
      "send",
      "go ahead",
      "do it",
      "sure",
      "yes send",
      "ok send",
      "you can send",
    ];
  }

  if (toolName === "post_to_linkedin" || toolName === "reply_to_linkedin_comment") {
    return [
      "yes",
      "ok",
      "okay",
      "confirm",
      "post it",
      "post",
      "go ahead",
      "do it",
      "sure",
      "yes post",
      "ok post",
      "you can post",
    ];
  }

  if (toolName === "delete_linkedin_post" || toolName === "delete_event") {
    return [
      "yes",
      "confirm",
      "delete it",
      "delete",
      "go ahead",
      "do it",
      "ok",
      "okay",
    ];
  }

  return ["yes", "confirm", "ok", "okay", "go ahead", "do it"];
}

export function buildPendingAction(toolName, args) {
  return {
    toolName,
    args: args || {},
    preview: buildPreview(toolName, args || {}),
    createdAt: new Date().toISOString(),
  };
}

export function setPendingAction(action) {
  pendingState.action = action || null;
}

export function getPendingAction() {
  return pendingState.action;
}

export function clearPendingAction() {
  pendingState.action = null;
}

export function formatPendingPreview(action) {
  return action?.preview || "";
}

export function isDraftRequestMessage(text) {
  const normalized = normalize(text);
  if (!normalized) {
    return false;
  }

  return DRAFT_REQUEST_PHRASES.some((phrase) => normalized.includes(phrase));
}

export function isCancelMessage(text) {
  const normalized = normalize(text);
  if (!normalized) {
    return false;
  }

  return CANCEL_PHRASES.some((phrase) => normalized === phrase || normalized.includes(phrase));
}

export function isConfirmationMessage(text, action) {
  const normalized = normalize(text);
  if (!normalized) {
    return false;
  }

  const tokens = getConfirmTokens(action?.toolName);
  return tokens.some((token) => normalized === token || normalized.includes(token));
}
