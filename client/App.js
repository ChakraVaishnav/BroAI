import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ChatScreen from './src/screens/ChatScreen';
import { ThemeProvider } from './src/styles/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ChatScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
