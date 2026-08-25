import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '../nativewind.css';
import { useAuth } from '../lib/auth';
import { APP_FONT, useAppFonts } from '../lib/fonts';
import { useConnectivity } from '../lib/online';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

function Boot({ children }: { children: React.ReactNode }) {
  const bootstrap = useAuth((s) => s.bootstrap);
  useConnectivity();
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  return <>{children}</>;
}

export default function RootLayout() {
  // the splash stays up until the house font is in (see lib/fonts.ts)
  const fontsReady = useAppFonts();
  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0b1210' }}>
      {/* Screens read the notch and home-indicator insets from here; without
          the provider a centred column renders underneath both. */}
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Boot>
            {/* Dark is the default: this app is used at night. */}
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: '#0b1210' },
                headerTintColor: '#e7ece9',
                headerTitleStyle: { fontFamily: APP_FONT },
                contentStyle: { backgroundColor: '#0b1210' },
              }}
            />
          </Boot>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
