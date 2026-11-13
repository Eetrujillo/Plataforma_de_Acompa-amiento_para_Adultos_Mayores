/**
 * Generic typed store over the shared storage layer (S2).
 * One cache per collection = single source of truth shared by every screen,
 * read through `useSyncExternalStore` (no setState-in-effect). Writes update
 * the cache, notify subscribers, and persist through the shared storage
 * layer (AsyncStorage / localStorage under the hood).
 */

import { randomUUID } from 'expo-crypto';

import { StorageKeys, loadObject, saveObject } from '@/services/storage';

export interface BaseRecord {
  id: string;
  createdAt: string;
}

const CollectionKeys = {
  dosificaciones: StorageKeys.dosificaciones,
  alertas: StorageKeys.alertas,
  tareas: StorageKeys.tareas,
  citas: StorageKeys.citas,
} as const;

export type CollectionName = keyof typeof CollectionKeys;

/* ------------------------------------------------------------------ */
/* External store                                                      */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>();
const cache = new Map<CollectionName, BaseRecord[]>();
const hydrated = new Map<CollectionName, Promise<void>>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot for `useSyncExternalStore`; `null` = not read yet (loading). */
export function getCollection<T extends BaseRecord>(collection: CollectionName): T[] | null {
  if (!hydrated.has(collection)) return null;
  return (cache.get(collection) as T[]) ?? [];
}

/** Idempotent background read of one collection into the cache. */
export function ensureCollection(collection: CollectionName): Promise<void> {
  let pending = hydrated.get(collection);
  if (!pending) {
    pending = loadObject<BaseRecord[]>(CollectionKeys[collection]).then((stored) => {
      cache.set(collection, stored ?? []);
      // Subscribers rendered the "null" (loading) snapshot; wake them up so
      // they see the hydrated collection.
      notify();
    });
    hydrated.set(collection, pending);
  }
  return pending;
}

async function writeCollection(
  collection: CollectionName,
  next: BaseRecord[],
): Promise<void> {
  await ensureCollection(collection);
  cache.set(collection, next);
  await saveObject(CollectionKeys[collection], next);
  notify();
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

export async function createRecord<T extends BaseRecord>(
  collection: CollectionName,
  data: Omit<T, 'id' | 'createdAt'>,
): Promise<T> {
  const record = {
    ...(data as T),
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  } as T;
  const current = await ensureCollection(collection).then(() => getCollection<T>(collection));
  await writeCollection(collection, [...(current ?? []), record]);
  return record;
}

export async function updateRecord<T extends BaseRecord>(
  collection: CollectionName,
  id: string,
  patch: Partial<Omit<T, 'id' | 'createdAt'>>,
): Promise<T | null> {
  const current = (await ensureCollection(collection).then(() =>
    getCollection<T>(collection),
  )) as T[];
  const index = current.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const updated = { ...current[index], ...patch } as T;
  const next = current.slice();
  next[index] = updated;
  await writeCollection(collection, next);
  return updated;
}

export async function toggleRecord<T extends BaseRecord>(
  collection: CollectionName,
  id: string,
  field: string,
): Promise<T | null> {
  const current = (await ensureCollection(collection).then(() =>
    getCollection<T>(collection),
  )) as T[];
  const item = current.find((element) => element.id === id);
  if (!item) return null;
  const record = item as Record<string, unknown>;
  return updateRecord<T>(collection, id, { [field]: !record[field] } as Partial<T>);
}

export async function deleteRecord(
  collection: CollectionName,
  id: string,
): Promise<boolean> {
  const current = await ensureCollection(collection).then(() => getCollection(collection));
  if (!current) return false;
  const next = current.filter((item) => item.id !== id);
  if (next.length === current.length) return false;
  await writeCollection(collection, next);
  return true;
}
