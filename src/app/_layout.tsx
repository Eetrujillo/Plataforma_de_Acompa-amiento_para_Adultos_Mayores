import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { Palette } from '@/constants/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Palette.surface } }}>
        {/* Landing page (`.web.tsx` variant wins on web, plain file on mobile) */}
        <Stack.Screen name="index" />
        {/* Design-only login / register screen (S7) */}
        <Stack.Screen name="auth" />
      </Stack>
    </>
  );
}
