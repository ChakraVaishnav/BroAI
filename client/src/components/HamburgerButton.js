import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { theme } from "../styles/theme";

export default function HamburgerButton({ open, onPress }) {
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: open ? 1 : 0,
      tension: 90,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [open, progress]);

  const topTransform = {
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 8],
        }),
      },
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "45deg"],
        }),
      },
    ],
  };

  const middleStyle = {
    opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 0],
    }),
    transform: [
      {
        scaleX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.2],
        }),
      },
    ],
  };

  const bottomTransform = {
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -8],
        }),
      },
      {
        rotate: progress.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", "-45deg"],
        }),
      },
    ],
  };

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]} hitSlop={10}>
      <View style={styles.stack}>
        <Animated.View style={[styles.line, topTransform]} />
        <Animated.View style={[styles.line, styles.middle, middleStyle]} />
        <Animated.View style={[styles.line, bottomTransform]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  pressed: {
    opacity: 0.65,
    transform: [{ scale: 0.98 }],
  },
  stack: {
    width: 20,
    height: 18,
    justifyContent: "center",
  },
  line: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1.8,
    borderRadius: 999,
    backgroundColor: theme.colors.text,
  },
  middle: {
    top: 8,
  },
});
