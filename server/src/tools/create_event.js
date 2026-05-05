import { createEvent } from "../google/calendar.js";

export default {
  name: "create_event",
  description: "Create a calendar event.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Title" },
      time: { type: "string", description: "Time or date-time" }
    },
    required: ["title", "time"],
    additionalProperties: false
  },
  execute: async ({ title, time }) => {
    return createEvent({ title, time });
  }
};