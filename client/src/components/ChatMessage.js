import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import TypingIndicator from "./TypingIndicator";
import { theme } from "../styles/theme";

function TraceLine({ text }) {
  return (
    <View style={styles.traceLineRow}>
      <View style={styles.traceDot} />
      <Text style={styles.traceLineText}>{text}</Text>
    </View>
  );
}

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";
  const isPreview = Boolean(message.preview);
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(lift, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, lift]);

  return (
    <Animated.View
      style={[
        styles.row,
        isUser ? styles.rowUser : styles.rowAssistant,
        {
          opacity: fade,
          transform: [{ translateY: lift }],
        },
      ]}
    >
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {isUser ? (
          <Text style={styles.userText}>{message.content}</Text>
        ) : isPreview ? (
          <View style={styles.previewBlock}>
            {message.phase === "loading" ? (
              <View style={styles.loadingRow}>
                <TypingIndicator />
                <Text style={styles.loadingText}>Thinking</Text>
              </View>
            ) : null}

            {message.phase === "trace" && message.traceShown?.length ? (
              <View style={styles.traceStack}>
                <Text style={styles.traceTitle}>Trace</Text>
                {message.traceShown.map((line) => (
                  <TraceLine key={line} text={line} />
                ))}
              </View>
            ) : null}

            {message.phase === "final" ? (
              <View>
                <Text style={styles.assistantText}>{message.content}</Text>
                {message.modelLabel ? <Text style={styles.modelLabel}>{message.modelLabel}</Text> : null}
              </View>
            ) : null}
          </View>
        ) : (
          <View>
            <Text style={styles.assistantText}>{message.content}</Text>
            {message.modelLabel ? <Text style={styles.modelLabel}>{message.modelLabel}</Text> : null}
          </View>
        )}
      </View>

      {!isUser && !isPreview && message.trace?.length ? (
        <View style={styles.inlineTraceSpacer} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: theme.spacing.md,
    maxWidth: "100%",
  },
  rowUser: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  rowAssistant: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "84%",
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  userBubble: {
    backgroundColor: theme.colors.text,
    borderBottomRightRadius: 10,
  },
  assistantBubble: {
    backgroundColor: theme.colors.surfaceAlt,
    borderBottomLeftRadius: 10,
  },
  userText: {
    color: theme.colors.background,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: theme.fonts.medium,
    letterSpacing: 0.1,
  },
  assistantText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontFamily: theme.fonts.regular,
    letterSpacing: 0.05,
  },
  modelLabel: {
    marginTop: theme.spacing.xs,
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.fonts.regular,
    letterSpacing: 0.4,
  },
  previewBlock: {
    gap: theme.spacing.sm,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  loadingText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontFamily: theme.fonts.medium,
    letterSpacing: 0.3,
  },
  traceStack: {
    gap: theme.spacing.xs,
  },
  traceTitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.fonts.medium,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  traceLineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  traceDot: {
    marginTop: 8,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.text,
  },
  traceLineText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: theme.fonts.regular,
    letterSpacing: 0.05,
  },
  inlineTraceSpacer: {
    height: 1,
  },
});
