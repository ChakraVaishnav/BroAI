/**
 * Response formatting utilities
 */

export function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === "text")
      .map((part) => part.text)
      .join("");
  }

  return "";
}

export function formatManualReply(text, startTime) {
  const timeTaken = ((Date.now() - startTime) / 1000).toFixed(2);
  return `${text}\n\n[Time: ${timeTaken}s | Model: server/manual]`;
}

export function buildActionSuccessText(action, result) {
  switch (action.toolName) {
    case "send_email":
    case "reply_to_email":
      return `Sir, the email has been sent successfully.`;
    case "post_to_linkedin":
      return `Sir, the LinkedIn post has been published successfully.`;
    case "reply_to_linkedin_comment":
      return `Sir, the LinkedIn reply has been posted successfully.`;
    case "delete_linkedin_post":
      return `Sir, the LinkedIn post has been deleted successfully.`;
    case "delete_event":
      return `Sir, the calendar event has been deleted successfully.`;
    default:
      return `Sir, the action completed successfully.`;
  }
}

export function extractActionError(result, fallback) {
  if (!result) {
    return fallback;
  }
  if (typeof result === "string") {
    return result;
  }
  if (result.error) {
    return String(result.error);
  }
  if (result.message) {
    return String(result.message);
  }
  return fallback;
}

export function isSuccessResult(result) {
  return Boolean(result && typeof result === "object" && result.success === true);
}
