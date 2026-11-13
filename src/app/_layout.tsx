import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { Palette } from '@/constants/theme';
import { ensureDemoUsers } from '@/services/auth';

export default function RootLayout() {
  // Demo accounts (one per role) exist on every device/browser that runs the
  // app; upsert is idempotent and coexists with real registrations.
  useEffect(() => {
    void ensureDemoUsers();
  }, []);

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
