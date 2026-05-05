import { listEvents } from "../google/calendar.js";

export default {
  name: "list_events",
  description: "List calendar events.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string", description: "Date" },
      dateText: { type: "string", description: "Natural language date" },
      start: { type: "string", description: "Start ISO" },
      end: { type: "string", description: "End ISO" },
      days: { type: "integer", minimum: 1, maximum: 30, description: "Days back" },
      mode: { type: "string", enum: ["upcoming", "past"], description: "Past or upcoming" }
    },
    additionalProperties: false
  },
  execute: async (args = {}) => {
    return listEvents(args);
  }
};