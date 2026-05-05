export default {
  name: "get_time",

  description: "Get current date and time.",

  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
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
};