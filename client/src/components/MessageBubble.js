import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useAppTheme, theme } from "../styles/theme";

const renderFormattedText = (text, defaultStyle) => {
  if (!text) return null;
  
  // Tokenize the string by **bold**, *italic*, and `code`
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  
  return (
    <Text style={defaultStyle} selectable={true}>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <Text key={index} style={{ fontWeight: '900' }}>{part.slice(2, -2)}</Text>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <Text key={index} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <Text key={index} style={{ fontFamily: 'monospace', backgroundColor: 'rgba(128,128,128,0.2)' }}> {part.slice(1, -1)} </Text>;
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
};

const MessageBubble = ({ message, isUser, modelLabel }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(10)).current;
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleLongPress = async () => {
    await Clipboard.setStringAsync(message);
    Alert.alert("Copied", "Message copied to clipboard", [{ text: "OK", style: "cancel" }], { cancelable: true });
  };

  const bubbleShadow = isDark ? {} : {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  };

  return (
    <Animated.View 
      style={[
        styles.container, 
        isUser ? styles.userContainer : styles.aiContainer,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }
      ]}
    >
      <TouchableOpacity 
        activeOpacity={0.8} 
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <View style={[
          styles.bubble, 
          bubbleShadow,
          isUser ? { backgroundColor: colors.bubbleUser, borderBottomRightRadius: 4 } : { backgroundColor: colors.bubbleAi, borderBottomLeftRadius: 4 }
        ]}>
          {renderFormattedText(message, [styles.text, { color: isUser ? colors.bubbleUserText : colors.bubbleAiText }])}
        </View>
      </TouchableOpacity>
      {!isUser && modelLabel && (
        <Text style={[styles.modelLabel, { color: colors.textSecondary }]}>{modelLabel}</Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    paddingHorizontal: theme.spacing.md,
    width: "100%",
  },
  userContainer: {
    alignItems: "flex-end",
  },
  aiContainer: {
    alignItems: "flex-start",
  },
  bubble: {
    padding: 14,
    borderRadius: 20,
    maxWidth: "85%",
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
  modelLabel: {
    fontSize: 9,
    marginTop: 6,
    marginLeft: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
});

export default MessageBubble;
