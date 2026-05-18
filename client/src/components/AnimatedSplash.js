import React, { useState, useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AnimatedSplash({ onFinish }) {
  const [displayedText, setDisplayedText] = useState("");
  const targetText = "Bro AI";
  const blink = useRef(new Animated.Value(1)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // 1. Blinking cursor animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    ).start();

    // 2. Typing animation
    let i = 0;
    const typeInterval = setInterval(() => {
      setDisplayedText((prev) => targetText.slice(0, i + 1));
      i++;
      
      if (i >= targetText.length) {
        clearInterval(typeInterval);
        
        // 3. Logo forms (fades in and scales up) above the text
        Animated.parallel([
          Animated.timing(logoOpacity, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.spring(logoScale, {
            toValue: 1,
            tension: 20,
            friction: 7,
            useNativeDriver: true,
          })
        ]).start(() => {
          // 4. Hold for a moment, then finish
          setTimeout(() => {
            onFinish();
          }, 800);
        });
      }
    }, 150);

    return () => clearInterval(typeInterval);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View 
        style={[
          styles.logoContainer, 
          { 
            opacity: logoOpacity, 
            transform: [{ scale: logoScale }] 
          }
        ]}
      >
        <Image 
          source={require("../../assets/bro_ai_icon_v2.png")} 
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      <Text style={styles.text}>
        {displayedText}
        <Animated.Text style={{ opacity: blink }}>▌</Animated.Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999, // Ensure it's above everything
  },
  logoContainer: {
    marginBottom: 24,
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 34,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "300",
    letterSpacing: 1,
  },
});
