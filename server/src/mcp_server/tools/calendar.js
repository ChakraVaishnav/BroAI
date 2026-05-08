import { createEvent, deleteEvent, listEvents } from "../../google/calendar.js";

function toIsoDateTime(date, time) {
  return new Date(`${date}T${time}:00`).toISOString();
}

function endDateFromStart(startDate) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export const calendarTools = [
  {
    name: "create_event",
    description:
      "Creates a new event on Google Calendar. Use this when the user wants to add a meeting, schedule something, set a reminder, or block time on their calendar. Always extract the event title, date, and time from the user's message.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Event title or name" },
        date: { type: "string", description: "Event date in ISO format YYYY-MM-DD" },
        startTime: { type: "string", description: "Start time in HH:MM 24-hour format" },
        endTime: { type: "string", description: "End time in HH:MM 24-hour format" },
        description: { type: "string", description: "Optional event description or notes" },
      },
      required: ["title", "date", "startTime", "endTime"],
    },
    execute: async ({ title, date, startTime }) => {
      const time = toIsoDateTime(date, startTime);
      return createEvent({ title, time });
    },
  },
  {
    name: "list_events",
    description:
      "Lists events from Google Calendar. Use when the user asks about their schedule, upcoming events, what's on their calendar today, tomorrow, this week, or within any specific date range. Also use when user asks about events on a specific date.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: {
          type: "string",
          description: "Start date in ISO format YYYY-MM-DD. Use today's date if user says 'today' or 'upcoming'.",
        },
        end_date: {
          type: "string",
          description:
            "End date in ISO format YYYY-MM-DD. Optional — use for range queries like 'this week' or 'next 7 days'.",
        },
      },
      required: ["start_date"],
    },
    execute: async ({ start_date, end_date }) => {
      const start = new Date(`${start_date}T00:00:00`).toISOString();
      const end = end_date ? new Date(`${end_date}T23:59:59`).toISOString() : endDateFromStart(start_date);
      return listEvents({ start, end });
    },
  },
  {
    name: "delete_event",
    description:
      "Deletes an existing event from Google Calendar. Use when the user wants to cancel, remove, or delete a calendar event. First list events if the user hasn't specified an exact event ID — identify the right event then delete it.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string", description: "Google Calendar event ID to delete" },
      },
      required: ["eventId"],
    },
    execute: async ({ eventId }) => {
      return deleteEvent({ eventId });
    },
  },
];
