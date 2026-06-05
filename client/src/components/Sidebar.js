import React, { useEffect, useRef, useState } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Animated, 
  Dimensions,
  Pressable,
  Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, theme } from "../styles/theme";
import { getModelsStatus } from "../utils/api";

const { width } = Dimensions.get("window");
const SIDEBAR_WIDTH = width * 0.85;

const Sidebar = ({ isOpen, onClose, chats, onSelectChat, onDeleteChat, onNewChat, activeChatId }) => {
  const { colors, isDark, toggleTheme } = useAppTheme();
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [modelsStatus, setModelsStatus] = useState([]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: isOpen ? 0 : -SIDEBAR_WIDTH,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: isOpen ? 1 : 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isOpen]);

  useEffect(() => {
    let interval;
    if (isOpen) {
      getModelsStatus().then(setModelsStatus).catch(() => {});
      interval = setInterval(() => {
        getModelsStatus().then(setModelsStatus).catch(() => {});
      }, 1000); // Poll every second for live countdown
    }
    return () => clearInterval(interval);
  }, [isOpen]);

  const formatTime = (ms) => {
    if (!ms || ms <= 0) return "";
    const totalSecs = Math.ceil(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m > 0 ? `${m}m ` : ''}${s}s`;
  };

  return (
    <View style={[styles.wrapper, !isOpen && { pointerEvents: "none" }]}>
      <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      
      <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }], backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.text }]}>BRO AI</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Premium Intelligence</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.chatList} showsVerticalScrollIndicator={false}>
          {/* Model Diagnostics Section */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Network Status</Text>
          <View style={styles.modelsContainer}>
            {modelsStatus.map((model) => (
              <View key={model.id} style={[styles.modelCard, { backgroundColor: isDark ? "#1A1A1A" : "#F5F5F5", borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <Text style={[styles.modelProvider, { color: colors.textSecondary }]}>{model.providerName}</Text>
                  <View style={[styles.statusPill, 
                    model.status === "Active" ? { backgroundColor: "rgba(76, 175, 80, 0.2)" } : 
                    model.status === "Standby" ? { backgroundColor: "rgba(158, 158, 158, 0.2)" } : 
                    { backgroundColor: "rgba(244, 67, 54, 0.2)" }]}>
                    <View style={[styles.statusDot, 
                      model.status === "Active" ? { backgroundColor: "#4CAF50" } : 
                      model.status === "Standby" ? { backgroundColor: "#9E9E9E" } : 
                      { backgroundColor: "#F44336" }]} />
                    <Text style={[styles.statusText, 
                      model.status === "Active" ? { color: "#4CAF50" } : 
                      model.status === "Standby" ? { color: "#9E9E9E" } : 
                      { color: "#F44336" }]}>
                      {model.status}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <Text style={[styles.modelName, { color: colors.text }]}>{model.modelName}</Text>
                  {model.remainingMs && (
                    <Text style={[styles.cooldownText, { color: "#F44336" }]}>
                      Resets in: {formatTime(model.remainingMs)}
                    </Text>
                  )}
                </View>
              </View>
            ))}
            {modelsStatus.length === 0 && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, paddingHorizontal: 24, paddingBottom: 16 }}>Connecting to core...</Text>
            )}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 16 }]}>Recent Chats</Text>
          {chats.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Empty for now, bro.</Text>
            </View>
          ) : (
            chats.map((chat) => {
              const previewMsg = chat.messages?.find(m => !m.isUser);
              const previewText = previewMsg?.text
                ? previewMsg.text.replace(/\n/g, " ").slice(0, 55) + (previewMsg.text.length > 55 ? "…" : "")
                : null;

              return (
                <TouchableOpacity
                  key={chat.id}
                  activeOpacity={0.7}
                  style={[
                    styles.chatItem,
                    activeChatId === chat.id && { backgroundColor: isDark ? "#222" : "#E5E5E5" }
                  ]}
                  onPress={() => {
                    onSelectChat(chat.id);
                    onClose();
                  }}
                >
                  <View style={[styles.chatIcon, { backgroundColor: isDark ? "#111" : "#F5F5F5" }, activeChatId === chat.id && { backgroundColor: colors.text }]}>
                    <Ionicons
                      name="chatbubble-outline"
                      size={16}
                      color={activeChatId === chat.id ? colors.background : colors.iconInactive}
                    />
                  </View>
                  <View style={{ flex: 1, marginRight: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={[styles.chatName, { color: colors.textSecondary }, activeChatId === chat.id && { color: colors.text, fontWeight: "600" }]}
                    >
                      {chat.messages[0]?.text || "New Chat"}
                    </Text>
                    {previewText && (
                      <Text
                        numberOfLines={1}
                        style={[styles.chatPreview, { color: colors.textSecondary }]}
                      >
                        {previewText}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => onDeleteChat(chat.id)}
                    style={styles.deleteBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.error} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <View style={[styles.footer, { borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity 
              style={[styles.newChatButton, { backgroundColor: colors.text, flex: 1, marginRight: 12 }]} 
              onPress={onNewChat}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={24} color={colors.background} />
              <Text style={[styles.newChatText, { color: colors.background }]}>Start New Session</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.newChatButton, { backgroundColor: colors.surface, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.border }]} 
              onPress={toggleTheme}
              activeOpacity={0.8}
            >
              <Ionicons name={isDark ? "sunny" : "moon"} size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  container: {
    width: SIDEBAR_WIDTH,
    height: "100%",
    borderRightWidth: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: theme.spacing.lg,
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 3,
    marginTop: 4,
  },
  closeButton: {
    padding: 8,
    marginTop: -4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginHorizontal: 24,
    marginBottom: 16,
  },
  chatList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginHorizontal: 12,
    borderRadius: 14,
    marginBottom: 4,
  },
  chatIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  chatName: {
    fontSize: 14,
    flex: 1,
  },
  chatPreview: {
    fontSize: 11,
    opacity: 0.55,
    marginTop: 2,
  },
  deleteBtn: {
    padding: 8,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    paddingBottom: 40,
  },
  newChatButton: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  newChatText: {
    fontSize: 15,
    fontWeight: "900",
    marginLeft: 8,
  },
  modelsContainer: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  modelCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  modelProvider: {
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  modelName: {
    fontSize: 14,
    fontWeight: "600",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cooldownText: {
    fontSize: 12,
    fontWeight: "800",
  },
});

export default Sidebar;
