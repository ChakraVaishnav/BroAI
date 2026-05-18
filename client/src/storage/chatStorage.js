import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  chats: "@broai_chats",
  selectedChatId: "@broai_selected_chat_id",
  googleConnected: "@broai_google_connected",
};

function createId() {
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function getFirstMessageText(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "";
  }

  const first = messages[0];
  if (typeof first?.text === "string") {
    return first.text;
  }

  if (typeof first?.content === "string") {
    return first.content;
  }

  return "";
}

function toTitle(text) {
  const normalized = normalizeString(text).replace(/\s+/g, " ");
  if (!normalized) {
    return "New Chat";
  }

  return normalized.length > 48 ? `${normalized.slice(0, 45)}...` : normalized;
}

async function readChats() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.chats);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeChats(chats) {
  await AsyncStorage.setItem(STORAGE_KEYS.chats, JSON.stringify(chats));
}

export async function loadChats() {
  const chats = await readChats();
  return chats.sort((a, b) => {
    const aDate = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bDate = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bDate - aDate;
  });
}

export async function getAllChats() {
  return loadChats();
}

export function createChatDraft() {
  const now = new Date().toISOString();
  return {
    id: createId(),
    title: "New Chat",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateChatTitleFromMessage(chat, messageText) {
  const base = chat || {};
  const title = toTitle(messageText || getFirstMessageText(base.messages));
  return {
    ...base,
    title,
  };
}

export async function saveChat(chatOrId, maybeData) {
  const chats = await readChats();
  const now = new Date().toISOString();

  let nextChat = null;

  if (typeof chatOrId === "string") {
    const existing = chats.find((item) => item.id === chatOrId) || {};
    const data = maybeData || {};
    const messages = data.messages || existing.messages || [];

    nextChat = {
      id: chatOrId,
      title: data.title || existing.title || toTitle(getFirstMessageText(messages)),
      messages,
      createdAt: data.createdAt || existing.createdAt || now,
      updatedAt: data.updatedAt || now,
    };
  } else {
    const chat = chatOrId || {};
    const id = chat.id || createId();
    const existing = chats.find((item) => item.id === id) || {};
    const messages = chat.messages || existing.messages || [];

    nextChat = {
      id,
      title: chat.title || existing.title || toTitle(getFirstMessageText(messages)),
      messages,
      createdAt: chat.createdAt || existing.createdAt || now,
      updatedAt: chat.updatedAt || now,
    };
  }

  const filtered = chats.filter((item) => item.id !== nextChat.id);
  const nextChats = [nextChat, ...filtered];
  await writeChats(nextChats);
  return nextChat;
}

export async function deleteChat(chatId) {
  if (!chatId) {
    return;
  }

  const chats = await readChats();
  const nextChats = chats.filter((chat) => chat.id !== chatId);
  await writeChats(nextChats);
}

export async function saveSelectedChatId(chatId) {
  if (!chatId) {
    await AsyncStorage.removeItem(STORAGE_KEYS.selectedChatId);
    return;
  }

  await AsyncStorage.setItem(STORAGE_KEYS.selectedChatId, String(chatId));
}

export async function loadSelectedChatId() {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.selectedChatId);
  } catch {
    return null;
  }
}

export async function saveGoogleConnected(isConnected) {
  await AsyncStorage.setItem(STORAGE_KEYS.googleConnected, isConnected ? "true" : "false");
}

export async function loadGoogleConnected() {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.googleConnected);
    return value === "true";
  } catch {
    return false;
  }
}
