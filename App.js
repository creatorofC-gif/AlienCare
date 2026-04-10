import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';

export default function App({ safeResume = false }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider style={{ flex: 1 }}>
        <AppNavigator safeResume={safeResume} />
        <StatusBar style="light" translucent={true} backgroundColor="transparent" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
