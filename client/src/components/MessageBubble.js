import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, PanResponder, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Markdown from "react-native-markdown-display";
import { useAppTheme, theme } from "../styles/theme";
import TypingIndicator from "./TypingIndicator";

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
const MessageBubble = ({ message, image, isUser, modelLabel, meta, isTyping, isStreaming }) => {
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
      onMoveShouldSetPanResponderCapture: (e, g) => Math.abs(g.dx) > 10 && Math.abs(g.dy) < 10,
      onPanResponderMove: (e, g) => {
        if (!isUser && g.dx > 0) {
          swipeX.setValue(Math.min(g.dx, 100)); // cap swipe right
        } else if (isUser && g.dx < 0) {
          swipeX.setValue(Math.max(g.dx, -100)); // cap swipe left
        }
      },
      onPanResponderRelease: async (e, g) => {
        const isAISwipeComplete = !isUser && g.dx > 60;
        const isUserSwipeComplete = isUser && g.dx < -60;

        if ((isAISwipeComplete || isUserSwipeComplete) && message) {
          // Trigger copy and haptic
          setHasCopied(true);
          await Clipboard.setStringAsync(message);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

          // Snap to open position, hold to show checkmark, then snap back
          Animated.sequence([
            Animated.spring(swipeX, { toValue: isUser ? -80 : 80, friction: 6, useNativeDriver: true }),
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
      {/* Copy hint icon — visible when swiping */}
      {!isTyping && (
        <Animated.View
          style={[
            styles.copyHint,
            isUser ? { right: -50, left: undefined } : { left: -50, right: undefined },
            {
              opacity: swipeX.interpolate({ 
                inputRange: isUser ? [-60, 0] : [0, 60], 
                outputRange: isUser ? [1, 0] : [0, 1],
                extrapolate: 'clamp'
              }),
              transform: [{ 
                scale: swipeX.interpolate({ 
                  inputRange: isUser ? [-60, 0] : [0, 60], 
                  outputRange: isUser ? [1, 0.6] : [0.6, 1],
                  extrapolate: 'clamp'
                }) 
              }],
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
            {image && (
              <Animated.Image 
                source={{ uri: image }} 
                style={[styles.attachedImage, { borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }]} 
              />
            )}
            {message ? <Text style={[styles.text, { color: textColor }]}>{message}</Text> : null}
          </BlurView>
        ) : (
          <View style={[styles.bubble, styles.aiBubble, { backgroundColor: isDark ? "#1c1c1c" : "#EBEBEB" }]}>
            {isTyping ? (
              <TypingIndicator dotColor={textColor} />
            ) : (
              <View>
                <Markdown 
                  style={{
                    body: { color: textColor, fontSize: 16, lineHeight: 24, letterSpacing: 0.2 },
                    code_inline: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', paddingHorizontal: 4, borderRadius: 4 },
                    code_block: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 8, overflow: "hidden" },
                    fence: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 8, overflow: "hidden" },
                    strong: { fontWeight: "900" },
                    em: { fontStyle: "italic" },
                    paragraph: { marginTop: 0, marginBottom: 8 },
                    bullet_list: { marginBottom: 8 },
                    ordered_list: { marginBottom: 8 },
                    heading1: { fontSize: 24, fontWeight: "bold", marginVertical: 8 },
                    heading2: { fontSize: 20, fontWeight: "bold", marginVertical: 8 },
                    heading3: { fontSize: 18, fontWeight: "bold", marginVertical: 8 },
                  }}
                >
                  {message}
                </Markdown>
                {isStreaming && <StreamingCursor color={textColor} />}
              </View>
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
    marginLeft: 6,
  },
  attachedImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
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
