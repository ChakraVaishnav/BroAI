import "dotenv/config";
import { ChatGroq } from "@langchain/groq";

let groqModel = null;

function getGroqModel() {
  if (groqModel) {
    return groqModel;
  }

  groqModel = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL_1 || "llama-3.3-70b-versatile",
    temperature: 0,
  });

  return groqModel;
}

export function getLlmWithTools(tools) {
  const llm = getGroqModel();
  return llm.bindTools(tools);
}