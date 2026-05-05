import { readMemory, saveMemory } from "../memory/memory.js";

export default {
  name: "store_memory",
  description: "Store important long-term user information",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string" },
      value: { type: "string" }
    },
    required: ["key", "value"]
  },

  execute: async ({ key, value }) => {
    const memory = readMemory();

    // Handle arrays like projects or goals
    if (Array.isArray(memory[key])) {
      if (!memory[key].includes(value)) {
        memory[key].push(value);
      }
    } else {
      memory[key] = value;
    }

    saveMemory(memory);

    return { result: "Memory stored successfully" };
  }
};
