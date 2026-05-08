import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useAppTheme, theme } from "../styles/theme";

const MessageBubble = ({ message, isUser, modelLabel }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const { colors } = useAppTheme();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLongPress = async () => {
    await Clipboard.setStringAsync(message);
    // Optional: Add haptic feedback or a simple alert/toast
    Alert.alert("Copied", "Message copied to clipboard", [{ text: "OK", style: "cancel" }], { cancelable: true });
  };

  return (
    <Animated.View 
      style={[
        styles.container, 
        isUser ? styles.userContainer : styles.aiContainer,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <TouchableOpacity 
        activeOpacity={0.8} 
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <View style={[styles.bubble, isUser ? { backgroundColor: colors.bubbleUser, borderBottomRightRadius: 4 } : { backgroundColor: colors.bubbleAi, borderBottomLeftRadius: 4 }]}>
          <Text selectable={true} style={[styles.text, { color: isUser ? colors.bubbleUserText : colors.bubbleAiText }]}>{message}</Text>
        </View>
      </TouchableOpacity>
      {!isUser && modelLabel && (
        <Text style={[styles.modelLabel, { color: colors.textSecondary }]}>{modelLabel}</Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    paddingHorizontal: theme.spacing.md,
    width: "100%",
  },
  userContainer: {
    alignItems: "flex-end",
  },
  aiContainer: {
    alignItems: "flex-start",
  },
  bubble: {
    padding: 14,
    borderRadius: 20,
    maxWidth: "85%",
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  modelLabel: {
    fontSize: 9,
    marginTop: 6,
    marginLeft: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

export default MessageBubble;
