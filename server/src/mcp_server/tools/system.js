export const systemTools = [
  {
    name: "get_time",
    description: "Get the current date and time. Call this whenever Sir asks about the current time or date, or whenever you need to resolve \"today\", \"now\", or \"this week\" before passing dates to other tools. Never guess the date.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    execute: async () => {
      const now = new Date();
      return {
        iso: now.toISOString(),
        readable: now.toString(),
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        day: now.toLocaleDateString(undefined, { weekday: "long" }),
      };
    },
  },
];
