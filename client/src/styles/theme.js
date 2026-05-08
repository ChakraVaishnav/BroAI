import { useColorScheme } from "react-native";

export const lightColors = {
  background: "#FFFFFF",
  surface: "#F7F7F7",
  text: "#000000",
  textSecondary: "#666666",
  border: "#E5E5E5",
  accent: "#000000",
  error: "#FF3B30",
  bubbleUser: "#000000",
  bubbleUserText: "#FFFFFF",
  bubbleAi: "#F2F2F2",
  bubbleAiText: "#000000",
  iconInactive: "#888888",
};

export const darkColors = {
  background: "#000000",
  surface: "#111111",
  text: "#FFFFFF",
  textSecondary: "#888888",
  border: "#222222",
  accent: "#FFFFFF",
  error: "#FF3B30",
  bubbleUser: "#FFFFFF",
  bubbleUserText: "#000000",
  bubbleAi: "#151515",
  bubbleAiText: "#FFFFFF",
  iconInactive: "#555555",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const useAppTheme = () => {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  return {
    isDark,
    colors: isDark ? darkColors : lightColors,
    spacing,
  };
};

export const theme = {
  colors: darkColors,
  spacing,
};
