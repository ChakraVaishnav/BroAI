import { deleteEvent, deleteEventsByRange } from "../google/calendar.js";

export default {
  name: "delete_event",
  description: "Delete a calendar event or past range.",
  parameters: {
    type: "object",
    properties: {
      eventId: { type: "string", description: "Event ID" },
      date: { type: "string", description: "Date" },
      dateText: { type: "string", description: "Natural language date" },
      start: { type: "string", description: "Start ISO" },
      end: { type: "string", description: "End ISO" },
      days: { type: "integer", minimum: 1, maximum: 30, description: "Days back" },
      mode: { type: "string", enum: ["past"], description: "Past only" }
    },
    additionalProperties: false
  },
  execute: async (args = {}) => {
    if (args.eventId) {
      return deleteEvent({ eventId: args.eventId });
    }

    return deleteEventsByRange(args);
  }
};