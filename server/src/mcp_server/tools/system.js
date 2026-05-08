export const systemTools = [
  {
    name: "get_time",
    description: "Get current date and time.",
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
