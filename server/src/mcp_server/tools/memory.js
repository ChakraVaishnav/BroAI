import { readMemory, saveMemory } from "../../memory/memory.js";

export const memoryTools = [
  {
    name: "store_memory",
    description: "Save important facts about Sir for future sessions. Use proactively when Sir shares something worth remembering — preferences, project details, personal context.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "A short label for what is being remembered e.g. 'preferred_name', 'work_schedule'",
        },
        value: {
          type: "string",
          description: "The actual information to store",
        },
      },
      required: ["key", "value"],
    },
    execute: async ({ key, value }) => {
      const memory = readMemory();

      if (Array.isArray(memory[key])) {
        if (!memory[key].includes(value)) {
          memory[key].push(value);
        }
      } else {
        memory[key] = value;
      }

      saveMemory(memory);
      return { result: "Memory stored successfully" };
    },
  },
];
