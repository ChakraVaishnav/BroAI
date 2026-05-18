/**
 * Push notification utilities for BroAI
 * Handles permission request and local notification delivery
 * Used to notify user when AI response is ready while app is backgrounded
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false, // silent when in foreground — we show in-app UI
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Request notification permissions.
 * Call once on app start.
 */
export async function requestNotificationPermission() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("broai-responses", {
      name: "BroAI Responses",
      importance: Notifications.AndroidImportance.HIGH,
      sound: null,
      vibrationPattern: [0, 150, 100, 150],
      lightColor: "#FFFFFF",
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Send a local notification that the AI response is ready.
 * Only called when AppState is "background" or "inactive".
 */
export async function notifyResponseReady(previewText = "") {
  const truncated = previewText.length > 80
    ? previewText.slice(0, 77) + "..."
    : previewText;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "BRO AI",
      body: truncated || "Your response is ready.",
      data: { type: "response_ready" },
      ...(Platform.OS === "android" && { channelId: "broai-responses" }),
    },
    trigger: null, // fire immediately
  });
}
