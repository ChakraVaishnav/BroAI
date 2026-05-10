import { createEvent, deleteEvent, listEvents } from "../../google/calendar.js";

function toIsoDateTime(date, time) {
  // Ensure the time string is interpreted as IST (+05:30)
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

function endDateFromStart(startDate) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

export const calendarTools = [
  {
    name: "create_event",
    description: "Use this tool ONLY when Sir has explicitly said to add, create, or schedule a specific event with clear details. Do NOT call this if Sir just mentions something in passing or describes their schedule.",
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
    description: "ALWAYS use this tool when Sir asks about schedule, calendar, events, meetings, tasks for today, tomorrow, or any date. You have NO knowledge of Sir's actual calendar. Never make up events. Call this tool every time.",
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
      const start = new Date(`${start_date}T00:00:00+05:30`).toISOString();
      const end = end_date ? new Date(`${end_date}T23:59:59+05:30`).toISOString() : endDateFromStart(start);
      return listEvents({ start, end });
    },
  },
  {
    name: "delete_event",
    description: "Use this tool ONLY when Sir has explicitly said to delete or cancel a specific event. Always confirm the event ID by calling list_events first to find the exact event. Never delete without explicit permission.",
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
