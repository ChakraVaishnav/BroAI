import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../styles/theme";

const MIN_HEIGHT = 52;
const MAX_HEIGHT = MIN_HEIGHT * 3;

export default function Composer({ value, onChangeText, onSend, onStop, isSending }) {
  const [contentHeight, setContentHeight] = useState(MIN_HEIGHT);

  const inputHeight = useMemo(() => {
    const next = Math.max(MIN_HEIGHT, Math.min(contentHeight + 22, MAX_HEIGHT));
    return next;
  }, [contentHeight]);

  const scrollEnabled = contentHeight + 22 > MAX_HEIGHT;

  return (
    <View style={styles.outer}>
      <View style={styles.card}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Message Bro AI..."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          blurOnSubmit={false}
          scrollEnabled={scrollEnabled}
          onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
          style={[styles.input, { height: inputHeight }]}
          selectionColor={theme.colors.text}
          textAlignVertical="top"
          keyboardAppearance="dark"
          autoCorrect={true}
          autoCapitalize="sentences"
        />

        <Pressable
          onPress={isSending ? onStop : onSend}
          style={({ pressed }) => [styles.action, pressed && styles.pressed, isSending && styles.stopAction]}
          accessibilityRole="button"
          accessibilityLabel={isSending ? "Stop response" : "Send message"}
        >
          {isSending ? (
            <Text style={styles.stopText}>STOP</Text>
          ) : (
            <Text style={styles.sendText}>→</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: theme.fonts.regular,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 2,
    letterSpacing: 0.1,
  },
  action: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.text,
  },
  stopAction: {
    backgroundColor: theme.colors.text,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  sendText: {
    color: theme.colors.background,
    fontSize: 24,
    lineHeight: 24,
    fontFamily: theme.fonts.bold,
    marginTop: -2,
  },
  stopText: {
    color: theme.colors.background,
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: theme.fonts.bold,
  },
});
