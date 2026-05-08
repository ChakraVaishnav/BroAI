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

const { width } = Dimensions.get("window");
const SIDEBAR_WIDTH = width * 0.8;

const Sidebar = ({ isOpen, onClose, chats, onSelectChat, onDeleteChat, onNewChat, activeChatId }) => {
  const { colors, isDark, toggleTheme } = useAppTheme();
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

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
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Recent Chats</Text>
          {chats.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Empty for now, bro.</Text>
            </View>
          ) : (
            chats.map((chat) => (
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
                <Text 
                  numberOfLines={1} 
                  style={[styles.chatName, { color: colors.textSecondary }, activeChatId === chat.id && { color: colors.text, fontWeight: "600" }]}
                >
                  {chat.messages[0]?.text || "New Chat"}
                </Text>
                <TouchableOpacity 
                  onPress={() => onDeleteChat(chat.id)} 
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
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
    fontSize: 15,
    flex: 1,
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
});

export default Sidebar;
