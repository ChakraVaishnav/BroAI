import React, { useState, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, theme } from "../styles/theme";

const ChatInput = ({ onSend, isGenerating, onStop }) => {
  const [text, setText] = useState("");
  const [inputHeight, setInputHeight] = useState(45);
  const { colors, isDark } = useAppTheme();

  // Button press scale animation
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonGlow = useRef(new Animated.Value(0)).current;

  const handleSend = () => {
    if (text.trim()) {
      // Press animation: quick scale down then spring back
      Animated.sequence([
        Animated.spring(buttonScale, {
          toValue: 0.88,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
        Animated.spring(buttonScale, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
      ]).start();

      onSend(text.trim());
      setText("");
      setInputHeight(45);
    }
  };

  const handleContentSizeChange = (event) => {
    const height = event.nativeEvent.contentSize.height;
    setInputHeight(Math.min(135, Math.max(45, height)));
  };

  const hasText = text.trim().length > 0;

  const buttonBg = isGenerating
    ? colors.error || "#FF3B30"
    : hasText
    ? colors.text
    : colors.border;

  return (
    <BlurView 
      intensity={isDark ? 60 : 80} 
      tint={isDark ? "dark" : "light"} 
      style={styles.container}
    >
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
            borderColor: hasText ? colors.text : "rgba(128,128,128,0.2)",
          },
        ]}
      >
        <TextInput
          style={[styles.input, { height: inputHeight, color: colors.text }]}
          placeholder="Ask anything..."
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          onContentSizeChange={handleContentSizeChange}
          selectionColor={colors.accent}
          onSubmitEditing={handleSend}
        />

        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: buttonBg },
              !hasText && !isGenerating && styles.disabledButton,
            ]}
            onPress={isGenerating ? onStop : handleSend}
            disabled={!hasText && !isGenerating}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isGenerating ? "stop" : "arrow-up"}
              size={20}
              color={
                isGenerating
                  ? "#FFFFFF"
                  : hasText
                  ? colors.background
                  : colors.textSecondary
              }
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(128,128,128,0.2)",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingTop: 8,
    paddingBottom: 8,
    maxHeight: 135,
    lineHeight: 22,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
    marginBottom: 2,
  },
  disabledButton: {
    opacity: 0.25,
  },
});

export default ChatInput;
