import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";

/**
 * Waving 3-dot typing indicator.
 * Dots animate with staggered vertical bounce (wave effect).
 * Accepts a dotColor prop so it adapts to any bubble background.
 */
export default function TypingIndicator({ dotColor }) {
  const y1 = useRef(new Animated.Value(0)).current;
  const y2 = useRef(new Animated.Value(0)).current;
  const y3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const wave = (value, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.spring(value, {
            toValue: -6,
            friction: 4,
            tension: 120,
            useNativeDriver: true,
          }),
          Animated.spring(value, {
            toValue: 0,
            friction: 4,
            tension: 120,
            useNativeDriver: true,
          }),
          // pause before repeating
          Animated.delay(300),
        ])
      );

    const a1 = wave(y1, 0);
    const a2 = wave(y2, 120);
    const a3 = wave(y3, 240);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [y1, y2, y3]);

  const color = dotColor || "#888888";

  return (
    <View style={styles.row}>
      {[y1, y2, y3].map((y, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            { backgroundColor: color, transform: [{ translateY: y }] },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
