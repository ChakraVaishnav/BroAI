import { sendEmail } from "../google/gmail.js";

export default {
  name: "send_email",
  description: "Send a Gmail email.",
  parameters: {
    type: "object",
    properties: {
      to: { type: "string", description: "Recipient" },
      subject: { type: "string", description: "Subject" },
      body: { type: "string", description: "Body" }
    },
    required: ["to", "subject", "body"],
    additionalProperties: false
  },
  execute: async ({ to, subject, body }) => {
    return sendEmail({ to, subject, body });
  }
};