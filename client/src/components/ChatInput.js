import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../styles/theme";

const ChatInput = ({ onSend, isGenerating, onStop }) => {
  const [text, setText] = useState("");
  const [inputHeight, setInputHeight] = useState(45);

  const handleSend = () => {
    if (text.trim()) {
      onSend(text.trim());
      setText("");
      setInputHeight(45);
    }
  };

  const handleContentSizeChange = (event) => {
    const height = event.nativeEvent.contentSize.height;
    // Initial height is ~45. Max height 3x ~ 135
    setInputHeight(Math.min(135, Math.max(45, height)));
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, { height: inputHeight }]}
          placeholder="Type a message..."
          placeholderTextColor={theme.colors.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          onContentSizeChange={handleContentSizeChange}
          selectionColor={theme.colors.accent}
        />
        {isGenerating ? (
          <TouchableOpacity style={styles.button} onPress={onStop}>
            <Ionicons name="stop" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.button, !text.trim() && styles.disabledButton]} 
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Ionicons name="arrow-up" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: theme.colors.surface,
    borderRadius: 25,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    paddingTop: 8,
    paddingBottom: 8,
    maxHeight: 135,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: theme.spacing.sm,
    marginBottom: 2,
  },
  disabledButton: {
    opacity: 0.3,
  },
});

export default ChatInput;
