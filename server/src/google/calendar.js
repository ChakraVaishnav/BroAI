import { google } from "googleapis";
import { getAuthClient } from "./auth.js";

function getCalendarClient() {
  const auth = getAuthClient();
  return google.calendar({ version: "v3", auth });
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function parseRelativeDay(text) {
  if (!text || typeof text !== "string") {
    return null;
  }

  const normalized = text.trim().toLowerCase();

  if (normalized === "yesterday") {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return { start: startOfDay(d), end: endOfDay(d) };
  }

  if (normalized === "today") {
    const d = new Date();
    return { start: startOfDay(d), end: endOfDay(d) };
  }

  if (normalized === "tomorrow" || normalized === "tommorow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return { start: startOfDay(d), end: endOfDay(d) };
  }

  const pastMatch = normalized.match(/^past\s+(\d+)\s+days?$/i);
  if (pastMatch) {
    const days = Math.max(Number(pastMatch[1]) || 5, 1);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
  }

  return null;
}

function resolveWindow(opts = {}, { defaultMode = "upcoming" } = {}) {
  if (opts.eventId) {
    return { eventId: opts.eventId };
  }

  const providedText = opts.dateText || opts.relative || opts.when || opts.date;
  
  // 1. Try relative day (today, tomorrow, etc)
  const explicitRelative = parseRelativeDay(providedText);
  if (explicitRelative) {
    return explicitRelative;
  }

  // 2. Try past range
  const hasPastRange = opts.mode === "past" || opts.past === true || opts.days || opts.pastDays || opts.rangeDays;
  if (hasPastRange) {
    const days = Math.max(Number(opts.days || opts.pastDays || opts.rangeDays || 5) || 5, 1);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start, end };
  }

  // 3. Try explicit start/end
  if (opts.start || opts.end) {
    return {
      start: opts.start ? new Date(opts.start) : undefined,
      end: opts.end ? new Date(opts.end) : undefined
    };
  }

  // 4. Try parsing as a Date object
  if (providedText) {
    let d = new Date(providedText);
    if (Number.isNaN(d.getTime())) {
      const parsed = Date.parse(providedText);
      if (!Number.isNaN(parsed)) d = new Date(parsed);
    }

    if (!Number.isNaN(d.getTime())) {
      return { start: startOfDay(d), end: endOfDay(d) };
    }
  }

  // 5. Fallback to default
  if (defaultMode === "past") {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 5);
    return { start, end };
  }

  return { start: new Date() };
}

export async function createEvent({ title, time }) {
  const calendar = getCalendarClient();
  // Accept a variety of time inputs. If the provided `time` is a simple
  // clock time like "6:30pm", attach today's date so it becomes parseable.
  let start = new Date(time);

  if (Number.isNaN(start.getTime())) {
    const simpleTimeMatch = typeof time === "string" && time.trim().match(/^(\d{1,2}:\d{2})(\s*[ap]m)?$/i);
    if (simpleTimeMatch) {
      const today = new Date();
      const datePart = today.toISOString().split("T")[0];
      const combined = `${datePart}T${simpleTimeMatch[1]}${simpleTimeMatch[2] ? simpleTimeMatch[2].toLowerCase() : ''}`;
      start = new Date(combined);
    }
  }

  if (Number.isNaN(start.getTime())) {
    return { success: false, error: "Invalid event time. Provide an ISO date/time or a time like '6:30pm'." };
  }

  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: title,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() }
    }
  });

  const event = response.data;

  return {
    success: true,
    event: {
      id: event.id,
      title: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      link: event.htmlLink
    }
  };
}

export async function listEvents(opts = {}) {
  const calendar = getCalendarClient();

  const window = resolveWindow(opts, { defaultMode: "upcoming" });

  if (window.error) {
    return { success: false, error: window.error };
  }

  if (window.eventId) {
    return { success: false, error: "listEvents cannot use eventId" };
  }

  const params = {
    calendarId: "primary",
    maxResults: 250,
    singleEvents: true,
    orderBy: "startTime"
  };

  if (window.start) params.timeMin = window.start.toISOString();
  if (window.end) params.timeMax = window.end.toISOString();

  const response = await calendar.events.list(params);

  const items = response.data.items || [];

  return {
    success: true,
    events: items.map((event) => ({
      id: event.id,
      title: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date
    }))
  };
}

export async function deleteEvent({ eventId }) {
  const calendar = getCalendarClient();

  if (eventId) {
    await calendar.events.delete({
      calendarId: "primary",
      eventId
    });

    return {
      success: true,
      deletedEventId: eventId
    };
  }

  return {
    success: false,
    error: "Missing eventId. Use date/days for range deletion via the tool."
  };
}

export async function deleteEventsByRange(opts = {}) {
  const calendar = getCalendarClient();
  const window = resolveWindow(opts, { defaultMode: "past" });

  if (window.error) {
    return { success: false, error: window.error };
  }

  if (window.eventId) {
    return deleteEvent({ eventId: window.eventId });
  }

  const params = {
    calendarId: "primary",
    maxResults: 250,
    singleEvents: true,
    orderBy: "startTime"
  };

  if (window.start) params.timeMin = window.start.toISOString();
  if (window.end) params.timeMax = window.end.toISOString();

  const response = await calendar.events.list(params);
  const items = response.data.items || [];

  const deleted = [];
  for (const event of items) {
    if (!event.id) continue;
    await calendar.events.delete({ calendarId: "primary", eventId: event.id });
    deleted.push({
      id: event.id,
      title: event.summary,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date
    });
  }

  return {
    success: true,
    deletedCount: deleted.length,
    deleted
  };
}