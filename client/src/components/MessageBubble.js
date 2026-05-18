import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, PanResponder, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, theme } from "../styles/theme";
import TypingIndicator from "./TypingIndicator";

// ─── Markdown-lite renderer ─────────────────────────────────────────────────
const renderFormattedText = (text, defaultStyle) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return (
    <Text style={defaultStyle} selectable={true}>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**"))
          return <Text key={i} style={{ fontWeight: "900" }}>{part.slice(2, -2)}</Text>;
        if (part.startsWith("*") && part.endsWith("*"))
          return <Text key={i} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</Text>;
        if (part.startsWith("`") && part.endsWith("`"))
          return (
            <Text key={i} style={{ fontFamily: "monospace", backgroundColor: "rgba(128,128,128,0.2)" }}>
              {" "}{part.slice(1, -1)}{" "}
            </Text>
          );
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
};

// ─── Streaming cursor component ──────────────────────────────────────────────
const StreamingCursor = ({ color }) => {
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start();
    return () => blink.stopAnimation();
  }, [blink]);

  return (
    <Animated.Text style={{ opacity: blink, color, fontSize: 16, lineHeight: 23 }}>
      {" ▌"}
    </Animated.Text>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────
const MessageBubble = ({ message, isUser, modelLabel, meta, isTyping, isStreaming }) => {
  const { colors, isDark } = useAppTheme();

  // Entry animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(isUser ? 20 : -20)).current;
  const scaleAnim = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 10, tension: 70, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 10, tension: 70, useNativeDriver: true }),
    ]).start();
  }, []);

  // Swipe-to-copy via PanResponder
  const swipeX = useRef(new Animated.Value(0)).current;
  const [hasCopied, setHasCopied] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dy) < 10,
      onPanResponderMove: (e, g) => {
        if (!isUser && g.dx > 0) {
          swipeX.setValue(Math.min(g.dx, 100)); // cap swipe
        }
      },
      onPanResponderRelease: async (e, g) => {
        if (!isUser && g.dx > 60 && message) {
          // Trigger copy and haptic
          setHasCopied(true);
          await Clipboard.setStringAsync(message);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          // Snap to open position, hold to show checkmark, then snap back
          Animated.sequence([
            Animated.spring(swipeX, { toValue: 80, friction: 6, useNativeDriver: true }),
            Animated.delay(800),
            Animated.spring(swipeX, { toValue: 0, friction: 6, useNativeDriver: true }),
          ]).start(() => setHasCopied(false));
        } else {
          Animated.spring(swipeX, { toValue: 0, friction: 8, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const textColor = isUser ? (isDark ? "#FFFFFF" : "#000000") : colors.bubbleAiText;

  return (
    <Animated.View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
        {
          opacity: fadeAnim,
          transform: [
            { translateX: Animated.add(slideAnim, swipeX) },
            { scale: scaleAnim },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Copy hint icon — visible when swiping right */}
      {!isUser && !isTyping && (
        <Animated.View
          style={[
            styles.copyHint,
            {
              opacity: swipeX.interpolate({ inputRange: [0, 60], outputRange: [0, 1] }),
              transform: [{ scale: swipeX.interpolate({ inputRange: [0, 60], outputRange: [0.6, 1] }) }],
            },
          ]}
        >
          <View style={[styles.copyPill, { backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)" }]}>
            <Ionicons 
              name={hasCopied ? "checkmark" : "copy-outline"} 
              size={18} 
              color={hasCopied ? "#4CAF50" : colors.textSecondary} 
            />
            {hasCopied && <Text style={[styles.copyText, { color: "#4CAF50" }]}>Copied</Text>}
          </View>
        </Animated.View>
      )}

      {/* Bubble */}
      <View style={styles.bubbleWrapper}>
        {isUser ? (
          <BlurView
            intensity={isDark ? 30 : 60}
            tint={isDark ? "light" : "dark"}
            style={[styles.bubble, styles.userBubble]}
          >
            {renderFormattedText(message, [styles.text, { color: textColor }])}
          </BlurView>
        ) : (
          <View style={[styles.bubble, styles.aiBubble, { backgroundColor: isDark ? "#1c1c1c" : "#EBEBEB" }]}>
            {isTyping ? (
              <TypingIndicator dotColor={textColor} />
            ) : (
              <Text style={[styles.text, { color: textColor }]}>
                {renderFormattedText(message, [styles.text, { color: textColor }])}
                {isStreaming && <StreamingCursor color={textColor} />}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Model label */}
      {!isUser && !isTyping && modelLabel && (
        <Text style={[styles.modelLabel, { color: colors.textSecondary }]}>
          {modelLabel}
        </Text>
      )}

      {/* Response metadata footer */}
      {!isUser && !isTyping && meta && (
        <View style={styles.metaContainer}>
          <Text style={[styles.metaText, { color: colors.textSecondary }]}>
            {[
              meta.timeTaken ? `${meta.timeTaken}s` : null,
              meta.model ? meta.model.split(" / ")[0] : null,
            ].filter(Boolean).join("  ·  ")}
          </Text>
          {Array.isArray(meta.attempts) && meta.attempts.length > 1 && (
            <Text style={[styles.attemptsText, { color: colors.textSecondary }]}>
              {meta.attempts
                .map((a) =>
                  a.status === "failed"
                    ? `${a.provider}: ❌ ${a.reason}`
                    : `${a.provider}: ✓`
                )
                .join("  →  ")}
            </Text>
          )}
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 3,
    paddingHorizontal: theme.spacing.md,
    width: "100%",
  },
  userContainer: { alignItems: "flex-end" },
  aiContainer: { alignItems: "flex-start" },
  bubbleWrapper: {
    position: "relative",
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "84%",
  },
  userBubble: {
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
  },
  aiBubble: {
    borderRadius: 24,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  copyHint: {
    position: "absolute",
    left: -40,
    top: "35%",
    zIndex: 10,
  },
  copyPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  copyText: {
    fontSize: 12,
    fontWeight: "bold",
  },
  modelLabel: {
    fontSize: 9,
    marginTop: 10,
    marginLeft: 6,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  metaContainer: {
    marginTop: 3,
    marginLeft: 6,
    gap: 2,
  },
  metaText: {
    fontSize: 10,
    opacity: 0.55,
    letterSpacing: 0.4,
  },
  attemptsText: {
    fontSize: 9,
    opacity: 0.45,
    marginTop: 1,
  },
});

export default MessageBubble;
