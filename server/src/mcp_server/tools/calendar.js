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
    description: "Create a calendar event. Call ONLY when Sir gives explicit details and says to create/schedule/add it. Do not call if Sir just mentions something in passing.",
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
    description: "Fetch Sir's Google Calendar events. Call every time Sir asks about schedule, meetings, tasks, or any date. Always pass start_date and end_date as YYYY-MM-DD strings — never pass empty strings. If Sir says \"today\", call get_time first to get the date, then pass it here.",
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
    description: "Delete a calendar event. Always call list_events first to find and confirm the event ID. Call ONLY with explicit delete permission from Sir.",
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
