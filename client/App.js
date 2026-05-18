import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import ChatScreen from './src/screens/ChatScreen';
import AnimatedSplash from './src/components/AnimatedSplash';
import { ThemeProvider } from './src/styles/theme';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/widgetTaskHandler';

registerWidgetTaskHandler(widgetTaskHandler);

export default function App() {
  const [initialUrl, setInitialUrl] = useState(null);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Handle app opened from widget
    const getUrl = async () => {
      const url = await Linking.getInitialURL();
      if (url) setInitialUrl(url);
    };
    getUrl();

    const subscription = Linking.addEventListener('url', (event) => {
      setInitialUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {showSplash ? (
          <AnimatedSplash onFinish={() => setShowSplash(false)} />
        ) : (
          <ChatScreen initialUrl={initialUrl} clearUrl={() => setInitialUrl(null)} />
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
