import { Platform } from "react-native";

const DEFAULT_BASE_URL = Platform.select({
  android: "http://10.0.2.2:3000",
  ios: "http://localhost:3000",
  default: "http://localhost:3000",
});

const RUNTIME_ENV = process.env.EXPO_PUBLIC_NODE_ENV || process.env.NODE_ENV || "development";
const ENV_BASE_URL = RUNTIME_ENV === "production"
  ? process.env.EXPO_PUBLIC_BROAI_API_URL_PROD
  : process.env.EXPO_PUBLIC_BROAI_API_URL_DEV;

export const API_BASE_URL = ENV_BASE_URL || process.env.EXPO_PUBLIC_BROAI_API_URL || DEFAULT_BASE_URL;

export async function sendChatMessage(message, signal) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.EXPO_PUBLIC_BRO_AI_SECRET_TOKEN}`
    },
    body: JSON.stringify({ message }),
    signal,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.message || `Request failed with status ${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }

  return payload;
}

export async function getModelsStatus() {
  const response = await fetch(`${API_BASE_URL}/models/status`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.EXPO_PUBLIC_BRO_AI_SECRET_TOKEN}`
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models status: ${response.status}`);
  }

  const payload = await response.json();
  return payload.models;
}
