import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

const CHATS_DIR = `${FileSystem.documentDirectory}chats/`;

export const initStorage = async () => {
  const dirInfo = await FileSystem.getInfoAsync(CHATS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(CHATS_DIR, { intermediates: true });
  }
};

export const getAllChats = async () => {
  try {
    await initStorage();
    const files = await FileSystem.readDirectoryAsync(CHATS_DIR);
    const chats = await Promise.all(
      files.map(async (file) => {
        const content = await FileSystem.readAsStringAsync(`${CHATS_DIR}${file}`);
        return { id: file.replace(".json", ""), ...JSON.parse(content) };
      })
    );
    return chats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    console.error("Error getting chats:", error);
    return [];
  }
};

export const saveChat = async (chatId, chatData) => {
  try {
    await initStorage();
    const filePath = `${CHATS_DIR}${chatId}.json`;
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(chatData));
  } catch (error) {
    console.error("Error saving chat:", error);
  }
};

export const deleteChat = async (chatId) => {
  try {
    const filePath = `${CHATS_DIR}${chatId}.json`;
    await FileSystem.deleteAsync(filePath);
  } catch (error) {
    console.error("Error deleting chat:", error);
  }
};
