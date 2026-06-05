import React, { useState, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useAppTheme, theme } from "../styles/theme";

const ChatInput = ({ onSend, isGenerating, onStop }) => {
  const [text, setText] = useState("");
  const [inputHeight, setInputHeight] = useState(45);
  const [selectedImage, setSelectedImage] = useState(null);
  const { colors, isDark } = useAppTheme();

  // Button press scale animation
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonGlow = useRef(new Animated.Value(0)).current;

  const handleSend = () => {
    if (text.trim() || selectedImage) {
      // Press animation: quick scale down then spring back
      Animated.sequence([
        Animated.spring(buttonScale, {
          toValue: 0.88,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
        Animated.spring(buttonScale, {
          toValue: 1,
          friction: 4,
          tension: 200,
          useNativeDriver: true,
        }),
      ]).start();

      onSend(text.trim(), selectedImage);
      setText("");
      setSelectedImage(null);
      setInputHeight(45);
    }
  };

  const pickImage = async () => {
    // No permissions request is necessary for launching the image library
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      // Store the base64 string
      const asset = result.assets[0];
      setSelectedImage(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    }
  };

  const handleContentSizeChange = (event) => {
    const height = event.nativeEvent.contentSize.height;
    setInputHeight(Math.min(135, Math.max(45, height)));
  };

  const hasText = text.trim().length > 0;
  const hasContent = hasText || selectedImage;

  const buttonBg = isGenerating
    ? colors.error || "#FF3B30"
    : hasContent
    ? colors.text
    : colors.border;

  return (
    <BlurView 
      intensity={isDark ? 60 : 80} 
      tint={isDark ? "dark" : "light"} 
      style={styles.container}
    >
      <View
        style={[
          styles.inputWrapper,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
            borderColor: hasText ? colors.text : "rgba(128,128,128,0.2)",
          },
        ]}
      >
        {selectedImage && (
          <View style={styles.imagePreviewContainer}>
            <View style={styles.imagePreviewWrapper}>
              <Animated.Image 
                source={{ uri: selectedImage }} 
                style={styles.imagePreview} 
              />
              <TouchableOpacity 
                style={styles.removeImageBtn}
                onPress={() => setSelectedImage(null)}
              >
                <Ionicons name="close" size={14} color="#FFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={styles.inputRow}>
          <TouchableOpacity 
            style={[styles.attachButton, { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)" }]}
            onPress={pickImage}
          >
            <Ionicons name="image-outline" size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          <TextInput
            style={[styles.input, { height: inputHeight, color: colors.text }]}
            placeholder="Ask anything..."
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
            onContentSizeChange={handleContentSizeChange}
            selectionColor={colors.accent}
            onSubmitEditing={handleSend}
          />

        <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: buttonBg },
              !hasContent && !isGenerating && styles.disabledButton,
            ]}
            onPress={isGenerating ? onStop : handleSend}
            disabled={!hasContent && !isGenerating}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isGenerating ? "stop" : "arrow-up"}
              size={20}
              color={
                isGenerating
                  ? "#FFFFFF"
                  : hasContent
                  ? colors.background
                  : colors.textSecondary
              }
            />
          </TouchableOpacity>
        </Animated.View>
        </View>
      </View>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(128,128,128,0.2)",
  },
  inputWrapper: {
    flexDirection: "column",
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginBottom: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingTop: 8,
    paddingBottom: 8,
    maxHeight: 135,
    lineHeight: 22,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 10,
    marginBottom: 2,
  },
  disabledButton: {
    opacity: 0.25,
  },
  imagePreviewContainer: {
    marginBottom: 8,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  imagePreviewWrapper: {
    position: "relative",
    width: 60,
    height: 60,
  },
  imagePreview: {
    width: 60,
    height: 60,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(128,128,128,0.3)",
  },
  removeImageBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
});

export default ChatInput;
