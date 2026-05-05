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
  ActivityIndicator,
  Alert
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../styles/theme";

const { width } = Dimensions.get("window");
const SIDEBAR_WIDTH = width * 0.8;

const Sidebar = ({ isOpen, onClose, chats, onSelectChat, onDeleteChat, onNewChat, activeChatId }) => {
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

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

  const handleGoogleConnect = () => {
    if (isConnected) {
      Alert.alert("Disconnect", "Are you sure you want to disconnect Google?", [
        { text: "Cancel", style: "cancel" },
        { text: "Disconnect", style: "destructive", onPress: () => setIsConnected(false) }
      ]);
      return;
    }

    setIsConnecting(true);
    // Mocking connection delay
    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
      Alert.alert("Connected", "Successfully connected to Google Workspace.");
    }, 2000);
  };

  return (
    <View style={[styles.wrapper, !isOpen && { pointerEvents: "none" }]}>
      <Animated.View style={[styles.backdrop, { opacity: opacityAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      
      <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>BRO AI</Text>
            <Text style={styles.subtitle}>Premium Intelligence</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="chevron-back" size={28} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.chatList} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Recent Chats</Text>
          {chats.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={40} color="#222" />
              <Text style={styles.emptyText}>Empty for now, bro.</Text>
            </View>
          ) : (
            chats.map((chat) => (
              <TouchableOpacity 
                key={chat.id} 
                activeOpacity={0.7}
                style={[styles.chatItem, activeChatId === chat.id && styles.activeChatItem]}
                onPress={() => {
                  onSelectChat(chat.id);
                  onClose();
                }}
              >
                <View style={[styles.chatIcon, activeChatId === chat.id && styles.activeChatIcon]}>
                  <Ionicons 
                    name="chatbubble-outline" 
                    size={16} 
                    color={activeChatId === chat.id ? "#000" : "#555"} 
                  />
                </View>
                <Text 
                  numberOfLines={1} 
                  style={[styles.chatName, activeChatId === chat.id && styles.activeChatName]}
                >
                  {chat.messages[0]?.text || "New Chat"}
                </Text>
                <TouchableOpacity 
                  onPress={() => onDeleteChat(chat.id)} 
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={16} color="#333" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.newChatButton} 
            onPress={onNewChat}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={24} color="#000" />
            <Text style={styles.newChatText}>Start New Session</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.authButton, isConnected && styles.authButtonConnected]} 
            onPress={handleGoogleConnect}
            disabled={isConnecting}
            activeOpacity={0.7}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color={theme.colors.text} />
            ) : (
              <>
                <Ionicons 
                  name={isConnected ? "checkmark-circle" : "logo-google"} 
                  size={20} 
                  color={isConnected ? "#4CAF50" : theme.colors.text} 
                />
                <Text style={styles.authText}>
                  {isConnected ? "Connected" : "Connect Google"}
                </Text>
              </>
            )}
          </TouchableOpacity>
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
    backgroundColor: theme.colors.background,
    borderRightWidth: 1,
    borderColor: "#111",
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
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
  },
  subtitle: {
    color: "#444",
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
    color: "#333",
    fontSize: 11,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginHorizontal: theme.spacing.lg,
    marginBottom: 16,
  },
  chatList: {
    flex: 1,
  },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: theme.spacing.lg,
    marginHorizontal: 12,
    borderRadius: 14,
    marginBottom: 4,
  },
  activeChatItem: {
    backgroundColor: "#0D0D0D",
  },
  chatIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  activeChatIcon: {
    backgroundColor: "#FFF",
  },
  chatName: {
    color: "#666",
    fontSize: 15,
    flex: 1,
  },
  activeChatName: {
    color: "#FFF",
    fontWeight: "600",
  },
  deleteBtn: {
    padding: 8,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#222",
    fontSize: 14,
    marginTop: 12,
  },
  footer: {
    padding: 24,
    borderTopWidth: 1,
    borderColor: "#111",
    paddingBottom: 40,
  },
  newChatButton: {
    flexDirection: "row",
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  newChatText: {
    color: "#000",
    fontSize: 15,
    fontWeight: "900",
    marginLeft: 8,
  },
  authButton: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#222",
  },
  authButtonConnected: {
    borderColor: "#4CAF5022",
    backgroundColor: "#4CAF5005",
  },
  authText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 10,
  },
});

export default Sidebar;
