import { readdir } from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const toolsDir = path.resolve(currentDir, "../tools");

export async function loadTools() {
  const files = await readdir(toolsDir);
  const tools = [];

  for (const file of files) {
    if (!file.endsWith(".js")) {
      continue;
    }

    const moduleUrl = pathToFileURL(path.join(toolsDir, file)).href;
    const toolModule = await import(moduleUrl);
    tools.push(toolModule.default);
  }

  return tools;
}