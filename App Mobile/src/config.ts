import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Dirección del backend.
 *
 * Web y app deben hablar con **el mismo servidor** para compartir la cuenta y
 * los datos (perfiles, actividades, marcas). Por eso la URL se resuelve así:
 *
 * 1. `EXPO_PUBLIC_API_BASE`, si está definida (build o `.env`).
 * 2. La IP del PC que sirve Expo, detectada en tiempo de ejecución. En un
 *    teléfono con Expo Go `localhost` apunta al propio teléfono, no al PC; el
 *    servidor de desarrollo sí conoce la IP de la red local.
 * 3. `10.0.2.2` en el emulador de Android y `localhost` en web/iOS.
 *
 * Además, la pantalla «Servidor» permite guardar otra URL en el dispositivo
 * (`services/apiBase.ts`), sin recompilar. Sirve para apuntar a un backend
 * desplegado o a otra máquina de la red.
 *
 * El puerto 3500 es el de `prod_local` (hexagonal + Prisma). El backend anterior
 * (MERN por capas) escuchaba en 3701 y ya no se usa para esta app.
 */
const BACKEND_PORT = 3500;

/**
 * Host del servidor de desarrollo de Expo.
 *
 * `hostUri` llega como `192.168.1.20:8081` en un teléfono y como
 * `localhost:8081` en web o en el simulador. Se toma solo el host.
 */
function expoDevHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig
      ?.debuggerHost ??
    null;

  if (!hostUri) return null;

  const host = hostUri.split(':')[0]?.trim();

  return host && host.length > 0 ? host : null;
}

function platformFallback(): string {
  if (Platform.OS === 'android') return `http://10.0.2.2:${BACKEND_PORT}/api`;

  return `http://localhost:${BACKEND_PORT}/api`;
}

/** URL con la que arranca la app si el usuario no ha guardado otra. */
export const DEFAULT_API_BASE = (() => {
  const configured = process.env.EXPO_PUBLIC_API_BASE?.trim();

  if (configured) return configured.replace(/\/+$/, '');

  const host = expoDevHost();

  // Un host de red local es alcanzable desde el teléfono; `localhost` no.
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:${BACKEND_PORT}/api`;
  }

  return platformFallback();
})();

/** Claves de almacenamiento. Se conservan las mismas de la versión web. */
export const STORAGE_KEYS = {
  authToken: 'gap_auth_token',
  seniorToken: 'gap_older_adult_token',
  seniorConsent: 'gap_older_adult_consent',
  seniorRoutine: 'gap_older_adult_routine',
  pendingCompletions: 'gap_older_adult_pending_completions',
  firedReminders: 'gap_older_adult_reminders_fired',
  /** URL del backend elegida en la pantalla «Servidor». */
  apiBase: 'gap_api_base',
} as const;

export const ALL_STORAGE_KEYS: string[] = Object.values(STORAGE_KEYS);
