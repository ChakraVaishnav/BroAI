/**
 * SkeletonBubble — animated placeholder bubbles shown while chat history loads
 */
import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet } from "react-native";
import { useAppTheme, theme } from "../styles/theme";

const SkeletonLine = ({ width, shimmer }) => {
  const { colors } = useAppTheme();
  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      style={[
        styles.line,
        {
          width,
          backgroundColor: colors.border,
          opacity,
        },
      ]}
    />
  );
};

const SkeletonBubble = ({ isUser = false, shimmer }) => {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
      ]}
    >
      <Animated.View
        style={[
          styles.bubble,
          { backgroundColor: isUser ? colors.bubbleUser : colors.bubbleAi, opacity: shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] }) },
        ]}
      >
        <SkeletonLine width="80%" shimmer={shimmer} />
        <SkeletonLine width="55%" shimmer={shimmer} />
      </Animated.View>
    </View>
  );
};

export default function SkeletonLoader() {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [shimmer]);

  return (
    <View style={styles.wrapper}>
      <SkeletonBubble isUser={false} shimmer={shimmer} />
      <SkeletonBubble isUser={true} shimmer={shimmer} />
      <SkeletonBubble isUser={false} shimmer={shimmer} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: 16,
  },
  container: {
    marginVertical: 4,
    paddingHorizontal: theme.spacing.md,
    width: "100%",
  },
  userContainer: { alignItems: "flex-end" },
  aiContainer: { alignItems: "flex-start" },
  bubble: {
    padding: 16,
    borderRadius: 20,
    width: "72%",
    gap: 10,
  },
  line: {
    height: 12,
    borderRadius: 6,
  },
});
