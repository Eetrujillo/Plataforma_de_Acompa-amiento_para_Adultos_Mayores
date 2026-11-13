/**
 * Shared storage layer — the single persistence API used by both platforms (S2).
 * AsyncStorage resolves to localStorage on web and to the native key-value
 * store on iOS/Android, so every service call below behaves identically on
 * web and mobile. Keys are namespaced with `aam.` to avoid collisions.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const StorageKeys = {
  users: 'aam.users',
  session: 'aam.session',
  dosificaciones: 'aam.dosificaciones',
  alertas: 'aam.alertas',
  tareas: 'aam.tareas',
  citas: 'aam.citas',
  vinculos: 'aam.vinculos',
} as const;

export async function loadObject<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveObject<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeItem(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
