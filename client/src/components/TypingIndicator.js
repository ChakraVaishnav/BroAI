import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet } from "react-native";
import { theme } from "../styles/theme";

export default function TypingIndicator() {
  const pulse1 = useRef(new Animated.Value(0.35)).current;
  const pulse2 = useRef(new Animated.Value(0.35)).current;
  const pulse3 = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const createLoop = (value, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 260,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0.35,
            duration: 260,
            useNativeDriver: true,
          }),
        ])
      );

    const anim1 = createLoop(pulse1, 0);
    const anim2 = createLoop(pulse2, 120);
    const anim3 = createLoop(pulse3, 240);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [pulse1, pulse2, pulse3]);

  return (
    <View style={styles.row}>
      {[pulse1, pulse2, pulse3].map((pulse, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              opacity: pulse,
              transform: [
                {
                  translateY: pulse.interpolate({
                    inputRange: [0.35, 1],
                    outputRange: [0, -2],
                  }),
                },
              ],
            },
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
    gap: 6,
    paddingVertical: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.text,
  },
});
