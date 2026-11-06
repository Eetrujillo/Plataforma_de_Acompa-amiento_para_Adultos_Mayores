import AsyncStorage from '@react-native-async-storage/async-storage';

import { ALL_STORAGE_KEYS } from '../config';

/**
 * Almacenamiento con caché en memoria.
 *
 * Motivo de diseño: en la web `localStorage` es síncrono y el código podía leer
 * el token, la cola de marcas o la rutina dentro de un `useState` inicial.
 * `AsyncStorage` es asíncrono, así que se hidrata una sola vez al arrancar y
 * después las lecturas salen de memoria. Las escrituras actualizan la memoria y
 * persisten en segundo plano (no bloquean la interfaz del adulto mayor).
 */

const memory = new Map<string, string>();
let hydrated = false;

/** Carga en memoria las claves que usa la app. Se llama una vez en el layout raíz. */
export async function hydrateStorage(): Promise<void> {
  if (hydrated) return;

  try {
    const entries = await AsyncStorage.multiGet(ALL_STORAGE_KEYS);
    for (const [key, value] of entries) {
      if (value !== null) memory.set(key, value);
    }
  } catch {
    // Si el almacenamiento falla, la app sigue funcionando sin datos guardados.
  } finally {
    hydrated = true;
  }
}

export function isStorageHydrated(): boolean {
  return hydrated;
}

export function getCached(key: string): string | null {
  return memory.get(key) ?? null;
}

export function setCached(key: string, value: string): void {
  memory.set(key, value);
  void AsyncStorage.setItem(key, value).catch(() => undefined);
}

export function removeCached(key: string): void {
  memory.delete(key);
  void AsyncStorage.removeItem(key).catch(() => undefined);
}

export function readJson<T>(key: string): T | null {
  const raw = getCached(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  setCached(key, JSON.stringify(value));
}

/** Solo para pruebas: vacía la caché en memoria sin tocar el dispositivo. */
export function resetStorageCache(): void {
  memory.clear();
  hydrated = false;
}
