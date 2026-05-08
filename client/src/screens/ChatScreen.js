import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
  Animated,
  StatusBar as RNStatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, theme } from "../styles/theme";
import MessageBubble from "../components/MessageBubble";
import ChatInput from "../components/ChatInput";
import Sidebar from "../components/Sidebar";
import { getAllChats, saveChat, deleteChat } from "../storage/chatStorage";
import { greetings } from "../data/greetings";

// Connect to production backend
const BACKEND_URL = "https://broai-bmmm.onrender.com";

const ChatScreen = () => {
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTrace, setCurrentTrace] = useState("");
  const [greeting, setGreeting] = useState("");

  const flatListRef = useRef(null);
  const abortControllerRef = useRef(null);
  const traceIntervalRef = useRef(null);
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const menuScale = useRef(new Animated.Value(1)).current;
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    loadChats();
    setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  const loadChats = async () => {
    const loadedChats = await getAllChats();
    setChats(loadedChats);
  };

  const handleMenuPress = () => {
    Animated.sequence([
      Animated.timing(menuScale, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(menuScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => setIsSidebarOpen(true));
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setIsSidebarOpen(false);
    setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
  };

  const handleSelectChat = (id) => {
    const chat = chats.find((c) => c.id === id);
    if (chat) {
      setActiveChatId(id);
      setMessages(chat.messages);
    }
  };

  const handleDeleteChat = async (id) => {
    await deleteChat(id);
    if (activeChatId === id) {
      handleNewChat();
    }
    loadChats();
  };

  const handleSend = async (text) => {
    const userMessage = { id: Date.now().toString(), text, isUser: true };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsGenerating(true);

    const traceMessages = ["Thinking...", "Scanning tools...", "Synthesizing...", "Finalizing..."];
    let traceIndex = 0;
    setCurrentTrace(traceMessages[0]);

    traceIntervalRef.current = setInterval(() => {
      traceIndex = (traceIndex + 1) % traceMessages.length;
      setCurrentTrace(traceMessages[traceIndex]);
    }, 1500);

    let chatId = activeChatId;
    if (!chatId) {
      chatId = `chat_${Date.now()}`;
      setActiveChatId(chatId);
    }

    // Map local messages to OpenAI-style history for the backend (Limit to last 10 for performance)
    const history = messages.slice(-10).map(m => ({
      role: m.isUser ? "user" : "assistant",
      content: m.text
    }));

    try {
      console.log(`\n[FRONTEND] 🚀 Sending message to backend: "${text}"`);
      console.log(`[FRONTEND] 🔗 URL: ${BACKEND_URL}/chat`);

      abortControllerRef.current = new AbortController();
      const response = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.EXPO_PUBLIC_BRO_AI_SECRET_TOKEN}`
        },
        body: JSON.stringify({ message: text, history }),
        signal: abortControllerRef.current.signal,
      });

      console.log(`[FRONTEND] 📥 Received status: ${response.status}`);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[FRONTEND] ❌ Server error text:`, errText);
        throw new Error(`Server error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      console.log(`[FRONTEND] ✅ Received JSON data:`, data);

      if (traceIntervalRef.current) clearInterval(traceIntervalRef.current);

      const aiMessage = {
        id: (Date.now() + 1).toString(),
        text: data.reply || data.response || "Error: No reply found in backend response.",
        isUser: false,
        modelLabel: "BRO AI",
      };

      const updatedMessages = [...newMessages, aiMessage];
      setMessages(updatedMessages);

      await saveChat(chatId, {
        messages: updatedMessages,
        createdAt: new Date().toISOString(),
      });
      loadChats();

    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("\n[FRONTEND] ❌ Chat error:", error);

        // Add an error message bubble so you can see it in the UI!
        const errorMessage = {
          id: (Date.now() + 1).toString(),
          text: `Connection Error: ${error.message}`,
          isUser: false,
          modelLabel: "SYSTEM ERROR",
        };
        setMessages(msgs => [...msgs, errorMessage]);
      }
    } finally {
      setIsGenerating(false);
      setCurrentTrace("");
      if (traceIntervalRef.current) clearInterval(traceIntervalRef.current);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (traceIntervalRef.current) clearInterval(traceIntervalRef.current);
    setIsGenerating(false);
    setCurrentTrace("");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        chats={chats}
        onSelectChat={handleSelectChat}
        onDeleteChat={handleDeleteChat}
        onNewChat={handleNewChat}
        activeChatId={activeChatId}
      />

      <Animated.View style={[styles.header, { paddingTop: Math.max(insets.top, 16), opacity: fadeAnim }]}>
        <Animated.View style={{ transform: [{ scale: menuScale }] }}>
          <TouchableOpacity
            onPress={handleMenuPress}
            style={styles.menuButton}
            activeOpacity={1}
          >
            <Ionicons name="menu-outline" size={32} color={colors.text} />
          </TouchableOpacity>
        </Animated.View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>BRO AI</Text>
        <TouchableOpacity style={styles.menuButton} onPress={handleNewChat}>
          <Ionicons name="add" size={28} color={colors.text} />
        </TouchableOpacity>
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item.text}
              isUser={item.isUser}
              modelLabel={item.modelLabel}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.emptyList
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={() => (
            <Animated.View style={[styles.greetingContainer, { opacity: fadeAnim }]}>
              <Text style={[styles.greetingText, { color: colors.text }]}>{greeting}</Text>
              <Text style={[styles.greetingSub, { color: colors.textSecondary }]}>Your personal intelligence, unlocked.</Text>
            </Animated.View>
          )}
          ListFooterComponent={() => isGenerating && (
            <View style={[styles.traceContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.textSecondary} style={{ marginRight: 12 }} />
              <Text style={[styles.traceText, { color: colors.textSecondary }]}>{currentTrace}</Text>
            </View>
          )}
        />

        <ChatInput
          onSend={handleSend}
          isGenerating={isGenerating}
          onStop={handleStop}
        />
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: "#222", // Default, will be overridden or we can remove border, let's keep border
  },
  menuButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 6,
    textTransform: "uppercase",
    marginLeft: 10,
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 16,
  },
  emptyList: {
    flex: 1,
    justifyContent: "center",
  },
  greetingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  greetingText: {
    fontSize: 32,
    fontWeight: "200",
    textAlign: "center",
    lineHeight: 42,
  },
  greetingSub: {
    fontSize: 12,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginTop: 20,
    textAlign: "center",
  },
  traceContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    marginVertical: 20,
    padding: 14,
    borderRadius: 16,
    alignSelf: "center",
    borderWidth: 1,
  },
  traceText: {
    fontSize: 13,
    fontWeight: "500",
    letterSpacing: 1,
  },
});

export default ChatScreen;
