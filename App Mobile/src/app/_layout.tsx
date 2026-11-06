import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CompletionSyncHost } from '../components/app/CompletionSyncHost';
import { ReminderHost } from '../components/app/ReminderHost';
import { SessionExpiredModal } from '../components/auth/SessionExpiredModal';
import { LoadingState } from '../components/ui/LoadingState';
import { AuthProvider } from '../context/AuthProvider';
import { startConnectivityMonitor } from '../services/connectivity';
import { hydrateStorage } from '../services/storage';
import { familyTheme, seniorTheme } from '../theme';
import { ThemeProvider } from '../theme/ThemeProvider';

/**
 * Layout raíz.
 *
 * Orden de arranque importante:
 * 1. Se hidrata `AsyncStorage` en memoria. Sin esto, las pantallas leerían un
 *    token vacío y mandarían al login aunque la sesión exista.
 * 2. Se arranca el monitor de conectividad (reemplaza `online`/`offline` web).
 * 3. Solo entonces se monta `AuthProvider` y las rutas.
 *
 * Aquí también viven los tres servicios globales de la web: el modal de sesión
 * vencida, el envío de marcas offline (HU-019) y los avisos (HU-016).
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void hydrateStorage().then(() => {
      if (active) setReady(true);
    });

    const stopConnectivity = startConnectivityMonitor();

    return () => {
      active = false;
      stopConnectivity();
    };
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: familyTheme.colors.background }}>
        <LoadingState label="Preparando la app…" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider theme={familyTheme}>
        <StatusBar style="dark" />

        <AuthProvider>
          <View style={{ flex: 1, backgroundColor: familyTheme.colors.background }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: familyTheme.colors.background },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="app" />
            </Stack>
          </View>

          <SessionExpiredModal />
          <CompletionSyncHost />

          {/* El aviso de actividad es del adulto mayor: usa su tema. */}
          <ThemeProvider theme={seniorTheme}>
            <ReminderHost />
          </ThemeProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
