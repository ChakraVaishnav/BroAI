import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const memoryPath = path.join(__dirname, "memory.json");

export function readMemory() {
  try {
    const data = fs.readFileSync(memoryPath, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    return {
      name: "",
      projects: [],
      preferences: {},
      goals: []
    };
  }
}

export function saveMemory(memory) {
  const dir = path.dirname(memoryPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
}
