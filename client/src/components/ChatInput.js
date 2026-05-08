import React, { useState } from "react";
import { View, TextInput, TouchableOpacity, StyleSheet, Keyboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, theme } from "../styles/theme";

const ChatInput = ({ onSend, isGenerating, onStop }) => {
  const [text, setText] = useState("");
  const [inputHeight, setInputHeight] = useState(45);
  const { colors, isDark } = useAppTheme();

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.inputWrapper, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          style={[styles.input, { height: inputHeight, color: colors.text }]}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          onContentSizeChange={handleContentSizeChange}
          selectionColor={colors.accent}
        />
        {isGenerating ? (
          <TouchableOpacity style={[styles.button, { backgroundColor: colors.text }]} onPress={onStop}>
            <Ionicons name="stop" size={24} color={colors.background} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.button, { backgroundColor: colors.text }, !text.trim() && styles.disabledButton]} 
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <Ionicons name="arrow-up" size={24} color={colors.background} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.md,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderRadius: 25,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingTop: 8,
    paddingBottom: 8,
    maxHeight: 135,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
