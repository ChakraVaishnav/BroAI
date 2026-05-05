import { getEmails } from "../google/gmail.js";

export default {
  name: "get_emails",
  description: "Get recent Gmail emails.",
  parameters: {
    type: "object",
    properties: {
      count: {
        type: "integer",
        minimum: 1,
        maximum: 20,
        description: "Email count"
      }
    },
    additionalProperties: false
  },
  execute: async ({ count } = {}) => {
    return getEmails({ limit: count });
  }
};