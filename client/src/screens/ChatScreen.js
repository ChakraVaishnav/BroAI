import React, { useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Animated,
  AppState,
  Image,
} from "react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, theme } from "../styles/theme";
import MessageBubble from "../components/MessageBubble";
import ChatInput from "../components/ChatInput";
import Sidebar from "../components/Sidebar";
import { getAllChats, saveChat, deleteChat } from "../storage/chatStorage";
import { greetings } from "../data/greetings";
import { API_BASE_URL } from "../utils/api";
import TypingIndicator from "../components/TypingIndicator";
import SkeletonLoader from "../components/SkeletonLoader";
import { requestNotificationPermission, notifyResponseReady } from "../utils/notifications";

// Backend URL from environment
const BACKEND_URL = API_BASE_URL;

function parseSSEEvent(rawEvent) {
  const lines = rawEvent.split(/\r?\n/);
  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
      continue;
    }

    if (line.startsWith("data:")) {
      // Preserve leading whitespace in streamed tokens.
      dataLines.push(line.startsWith("data: ") ? line.slice(6) : line.slice(5));
    }
  }

  return { event, data: dataLines.join("\n") };
}

const GOOGLE_TOKEN_KEY = "@broai_google_refresh_token";

const ChatScreen = ({ initialUrl, clearUrl }) => {
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [greeting, setGreeting] = useState("");
  const [showFab, setShowFab] = useState(false);
  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState(false);
  const googleTokenRef = useRef(null);

  const appState = useRef(AppState.currentState);

  const flatListRef = useRef(null);
  const abortControllerRef = useRef(null);
  const xhrRef = useRef(null);
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const menuScale = useRef(new Animated.Value(1)).current;
  const { colors, isDark, toggleTheme } = useAppTheme();

  useEffect(() => {
    loadChats();
    requestNotificationPermission();
    setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Load stored Google token on mount
    AsyncStorage.getItem(GOOGLE_TOKEN_KEY).then((token) => {
      if (token) {
        googleTokenRef.current = token;
        setGoogleConnected(true);
      }
    });

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!initialUrl) return;

    // Handle Google OAuth deep link: works for both standalone (broai://auth) and Expo Go (exp://.../--/auth)
    if (initialUrl.includes("auth?refresh_token=")) {
      try {
        const url = new URL(initialUrl);
        const token = url.searchParams.get("refresh_token");
        if (token) {
          AsyncStorage.setItem(GOOGLE_TOKEN_KEY, token).then(() => {
            googleTokenRef.current = token;
            setGoogleConnected(true);
            console.log("[FRONTEND] ✅ Google refresh token saved to storage.");
          });
        }
      } catch (e) {
        console.error("[FRONTEND] Failed to parse Google auth deep link:", e);
      }
      if (clearUrl) clearUrl();
      return;
    }

    if (chats.length > 0) {
      if (initialUrl.includes("new")) {
        handleNewChat();
      } else if (initialUrl.includes("last")) {
        if (chats[0]) handleSelectChat(chats[0].id);
      }
      if (clearUrl) clearUrl();
    }
  }, [initialUrl, chats]);

  const loadChats = async () => {
    setIsChatsLoading(true);
    const loadedChats = await getAllChats();
    setChats(loadedChats);
    setIsChatsLoading(false);
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

  const handleSend = async (text, imageBase64) => {
    // Phase 1: Send haptic
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMessage = { id: Date.now().toString(), text, isUser: true, image: imageBase64 };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsGenerating(true);

    let chatId = activeChatId;
    if (!chatId) {
      chatId = `chat_${Date.now()}`;
      setActiveChatId(chatId);
    }

    // ✅ Fix 2: Removed dead `history` field — backend maintains its own per-session history.
    // Send sessionId (chatId) so the backend scopes history to this conversation.

    try {
      console.log(`\n[FRONTEND] 🚀 Sending message to backend: "${text}"`);
      console.log(`[FRONTEND] 🔗 URL: ${BACKEND_URL}/chat`);

      const aiMessageId = (Date.now() + 1).toString();
      let streamedText = "";
      let finalText = "";
      let processedLength = 0;
      let buffer = "";
      let finished = false;
      let responseMeta = null; // timeTaken, model, attempts from done event
      let hapticFired = false;

      const updateLiveMessage = (textValue, meta = null) => {
        const aiMessage = {
          id: aiMessageId,
          text: textValue,
          isUser: false,
          modelLabel: "BRO AI",
          meta,
          isTyping: !textValue, // show typing dots when no text yet
          isStreaming: !finished && !!textValue, // show streaming cursor
        };
        setMessages([...newMessages, aiMessage]);
      };

      updateLiveMessage("");

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        xhr.open("POST", `${BACKEND_URL}/chat`, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Authorization", `Bearer ${process.env.EXPO_PUBLIC_BRO_AI_SECRET_TOKEN}`);
        // Attach stored Google refresh token so backend can use Gmail/Calendar
        if (googleTokenRef.current) {
          xhr.setRequestHeader("X-Google-Refresh-Token", googleTokenRef.current);
        }
        xhr.timeout = 0;

        xhr.onreadystatechange = () => {
          if (xhr.readyState === 2) {
            console.log(`[FRONTEND] 📥 Received status: ${xhr.status}`);
          }
        };

        xhr.onprogress = () => {
          const nextChunk = xhr.responseText.slice(processedLength);
          processedLength = xhr.responseText.length;
          buffer += nextChunk;

          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop() || "";

          for (const rawEvent of events) {
            const parsed = parseSSEEvent(rawEvent);
            if (!parsed.data && parsed.event !== "done") {
              continue;
            }

            if (parsed.event === "token" || parsed.event === "message") {
              if (!hapticFired && parsed.event === "token") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                hapticFired = true;
              }
              streamedText += parsed.data;
              updateLiveMessage(streamedText);
            } else if (parsed.event === "preview" || parsed.event === "final") {
              finalText += parsed.data;
              updateLiveMessage(finalText);
            } else if (parsed.event === "error") {
              finished = true;
              reject(new Error(parsed.data || "Streaming error from server."));
              return;
            } else if (parsed.event === "done") {
              finished = true;
              try { responseMeta = JSON.parse(parsed.data); } catch { /* ignore */ }
            }
          }
        };

        xhr.onerror = () => {
          if (!finished) {
            reject(new Error("Network error while streaming response."));
          }
        };

        xhr.onabort = () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        };

        xhr.onloadend = () => {
          try {
            if (!finished && xhr.status >= 400) {
              reject(new Error(`Server error: ${xhr.status} - ${xhr.responseText || "Unknown error"}`));
              return;
            }

            if (buffer.trim()) {
              const parsed = parseSSEEvent(buffer);
              if (parsed.event === "token" || parsed.event === "message") {
                streamedText += parsed.data;
              } else if (parsed.event === "preview" || parsed.event === "final") {
                finalText += parsed.data;
              } else if (parsed.event === "error") {
                reject(new Error(parsed.data || "Streaming error from server."));
                return;
              }
            }

            resolve();
          } catch (error) {
            reject(error);
          }
        };

        xhr.send(JSON.stringify({ message: text, sessionId: chatId, imageBase64 }));
      });

      const replyText = (finalText || streamedText).trim() || "Error: No reply found in backend response.";
      updateLiveMessage(replyText, responseMeta);

      const updatedMessages = [
        ...newMessages,
        {
          id: aiMessageId,
          text: replyText,
          isUser: false,
          modelLabel: "BRO AI",
          meta: responseMeta,
        },
      ];
      setMessages(updatedMessages);
      
      // Update or add chat in history
      const existingChat = chats.find(c => c.id === chatId);
      const updatedChat = existingChat
        ? { ...existingChat, messages: updatedMessages, updatedAt: Date.now() }
        : {
            id: chatId,
            messages: updatedMessages,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            provider: "Google Gemini", // could come from meta
          };

      // Phase 1: Notify if backgrounded
      if (appState.current.match(/inactive|background/)) {
        notifyResponseReady(replyText);
      }

      await saveChat(chatId, {
        messages: updatedMessages,
        createdAt: new Date().toISOString(),
      });
      loadChats();

      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("\n[FRONTEND] ❌ Chat error:", error);

          // Replace the stuck typing bubble with the error message
          const errorMessage = {
            id: aiMessageId,
            text: `Connection Error: ${error.message}`,
            isUser: false,
            modelLabel: "SYSTEM ERROR",
            isTyping: false,
            isStreaming: false,
          };
          
          setMessages([...newMessages, errorMessage]);
        }
      } finally {
      setIsGenerating(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (xhrRef.current) xhrRef.current.abort();
    setIsGenerating(false);
  };

  const handleScroll = (e) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    setShowFab(offsetY > 200);
  };

  const scrollToBottom = () => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
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

      <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
        <BlurView 
          intensity={isDark ? 80 : 100} 
          tint={isDark ? "dark" : "light"} 
          style={StyleSheet.absoluteFill} 
        />
        <View style={[styles.headerContent, { paddingTop: Math.max(insets.top, 16) }]}>
          <Animated.View style={{ transform: [{ scale: menuScale }] }}>
            <TouchableOpacity onPress={handleMenuPress} style={styles.menuButton} activeOpacity={0.7}>
              <Ionicons name="menu-outline" size={28} color={colors.text} />
            </TouchableOpacity>
          </Animated.View>
          <View style={{ flex: 1 }} />
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => {
                const redirectUrl = Linking.createURL("auth");
                Linking.openURL(`${BACKEND_URL}/auth/google?redirect=${encodeURIComponent(redirectUrl)}`);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={googleConnected ? "logo-google" : "logo-google"}
                size={20}
                color={googleConnected ? "#4ade80" : colors.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={toggleTheme}>
              <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuButton} onPress={handleNewChat}>
              <Ionicons name="add" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.content}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages.slice().reverse()}
          inverted
          keyExtractor={(item) => item.id}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <MessageBubble
              message={item.text}
              image={item.image}
              isUser={item.isUser}
              modelLabel={item.modelLabel}
              meta={item.meta}
              isTyping={item.isTyping}
              isStreaming={item.isStreaming}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.emptyList
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={() => (
            isChatsLoading ? (
              <SkeletonLoader />
            ) : (
              <Animated.View style={[styles.greetingContainer, { opacity: fadeAnim }]}>
                <LinearGradient
                  colors={isDark ? ["rgba(255,255,255,0.05)", "transparent"] : ["rgba(0,0,0,0.03)", "transparent"]}
                  style={styles.glowBg}
                />
                
                <Text style={[styles.greetingText, { color: colors.text }]}>{greeting}</Text>
                <Text style={[styles.greetingSub, { color: colors.textSecondary }]}>Your personal intelligence, unlocked.</Text>
                
                <View style={styles.quickReplies}>
                  {["Check my calendar", "Read my latest emails", "Any news in AI?"].map((q, i) => (
                    <TouchableOpacity key={i} style={[styles.chip, { borderColor: colors.border }]} onPress={() => handleSend(q)}>
                      <Text style={[styles.chipText, { color: colors.textSecondary }]}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Animated.View>
            )
          )}
          ListFooterComponent={() => null}
        />

        <ChatInput
          onSend={handleSend}
          isGenerating={isGenerating}
          onStop={handleStop}
        />
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      </KeyboardAvoidingView>

      {showFab && (
        <Animated.View style={styles.fabContainer}>
          <TouchableOpacity style={[styles.fab, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={scrollToBottom} activeOpacity={0.8}>
            <Ionicons name="arrow-down" size={20} color={colors.text} />
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(128,128,128,0.2)",
    overflow: "hidden",
  },
  headerContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 16,
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
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  content: {
    flex: 1,
    marginTop: 100, // account for absolute header
  },
  listContent: {
    paddingVertical: 16,
    flexGrow: 1,
  },
  emptyList: {
    justifyContent: "center",
  },
  greetingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    marginTop: 60,
    transform: [{ scaleY: -1 }, { scaleX: -1 }], // Fixes React Native Android inverted FlatList mirroring
  },
  glowBg: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    top: -100,
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
  quickReplies: {
    marginTop: 40,
    gap: 12,
    alignItems: "center",
  },
  chip: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  fabContainer: {
    position: "absolute",
    bottom: 90,
    alignSelf: "center",
    zIndex: 100,
  },
  fab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

});

export default ChatScreen;
