/**
 * ModuleScreen — generic CRUD factory for dashboard modules (S3).
 * One shared component renders list + create/edit forms + delete with a
 * two-step confirm (no native-only APIs, so it works on web and mobile).
 * Every screen passes its collection, fields and colors; persistence goes
 * through `src/services/collections.ts` (same calls on both platforms, S2).
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  type BaseRecord,
  type CollectionName,
  createRecord,
  deleteRecord,
  ensureCollection,
  getCollection,
  subscribe,
  toggleRecord,
  updateRecord,
} from '@/services/collections';

export interface ModuleFieldConfig {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  /** `HH:MM` validation. */
  time?: boolean;
  /** Optional fields pass with an empty value (default: required). */
  required?: boolean;
  /** ISO `YYYY-MM-DD` validation. */
  date?: boolean;
  /** Choose-one chips when present. */
  options?: string[];
}

interface FormValues {
  [key: string]: string;
}

export interface ModuleScreenConfig {
  title: string;
  subtitle: string;
  collection: CollectionName;
  accent: string;
  emptyText: string;
  fields: ModuleFieldConfig[];
  /** One summary line per item, rendered under the title. */
  summary: (item: never) => string;
  /** Optional toggle label; when set, items render a complete/undo chip. */
  toggle?: { field: string; labelOn: string; labelOff: string };
  /** First field is the item card title. */
  titleField: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateField(field: ModuleFieldConfig, value: string): string | null {
  if (!value.trim()) {
    return field.required === false ? null : `Ingresá ${field.label.toLowerCase()}`;
  }
  if (field.time && !TIME_RE.test(value.trim())) return 'Usá el formato HH:MM (24 h)';
  if (field.date && !DATE_RE.test(value.trim())) return 'Usá el formato AAAA-MM-DD';
  return null;
}

export function ModuleScreen(config: ModuleScreenConfig) {
  // Items come from the shared external store; `null` means still loading.
  const items = useSyncExternalStore(
    subscribe,
    () => getCollection<BaseRecord & Record<string, unknown>>(config.collection),
    () => null,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<FormValues>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void ensureCollection(config.collection);
  }, [config.collection]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setValues({});
    setErrors({});
  };

  const openCreate = () => {
    setEditingId(null);
    setValues(Object.fromEntries(config.fields.map((field) => [field.key, ''])));
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (item: BaseRecord & Record<string, unknown>) => {
    setEditingId(item.id);
    setValues(
      Object.fromEntries(config.fields.map((field) => [field.key, String(item[field.key] ?? '')])),
    );
    setErrors({});
    setFormOpen(true);
  };


  const save = async () => {
    const nextErrors: FormValues = {};
    for (const field of config.fields) {
      const error = validateField(field, values[field.key] ?? '');
      if (error) nextErrors[field.key] = error;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const data = Object.fromEntries(
      config.fields.map((field) => [field.key, values[field.key].trim()]),
    );
    if (editingId != null) {
      await updateRecord(config.collection, editingId, data);
    } else {
      await createRecord(config.collection, data as never);
    }
    closeForm();
  };

  const remove = async (id: string) => {
    await deleteRecord(config.collection, id);
    setConfirmDeleteId(null);
  };

  const changeToggle = async (id: string) => {
    if (!config.toggle) return;
    await toggleRecord(config.collection, id, config.toggle.field);
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: config.accent }]}>{config.title}</Text>
          <Text style={styles.subtitle}>{config.subtitle}</Text>
        </View>
        {config.toggle && items !== null && (
          <Text style={styles.countHint}>
            {items.filter((item) => item[config.toggle!.field]).length} de {items.length}{' '}
            {config.toggle.labelOn.toLowerCase()}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Create / edit form */}
        {formOpen ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>
              {editingId != null ? 'Editar' : 'Agregar nuevo'}
            </Text>
            {config.fields.map((field) => {
              if (field.options) {
                return (
                  <View key={field.key} style={styles.fieldWrap}>
                    <Text style={styles.label}>{field.label}</Text>
                    <View style={styles.chipRow}>
                      {field.options.map((option) => {
                        const selected = values[field.key] === option;
                        return (
                          <Pressable
                            key={option}
                            onPress={() => setValues((prev) => ({ ...prev, [field.key]: option }))}
                            style={[styles.chip, selected && { backgroundColor: config.accent }]}>
                            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                              {option}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {errors[field.key] && <Text style={styles.error}>{errors[field.key]}</Text>}
                  </View>
                );
              }
              return (
                <View key={field.key} style={styles.fieldWrap}>
                  <Text style={styles.label}>{field.label}</Text>
                  <TextInput
                    style={[styles.input, errors[field.key] && styles.inputInvalid]}
                    placeholder={field.placeholder}
                    placeholderTextColor="#9A96B8"
                    value={values[field.key] ?? ''}
                    onChangeText={(text) =>
                      setValues((prev) => ({ ...prev, [field.key]: text }))
                    }
                    multiline={field.multiline}
                    autoCapitalize={field.time || field.date ? 'none' : 'sentences'}
                  />
                  {errors[field.key] && <Text style={styles.error}>{errors[field.key]}</Text>}
                </View>
              );
            })}
            <View style={styles.formActions}>
              <Pressable onPress={save} style={styles.saveButton}>
                <Text style={styles.saveButtonText}>Guardar</Text>
              </Pressable>
              <Pressable onPress={closeForm} hitSlop={12}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={openCreate} style={styles.addButton}>
            <Text style={styles.addButtonText}>+ Agregar</Text>
          </Pressable>
        )}

        {/* List */}
        {items !== null && items.length === 0 && (
          <Text style={styles.empty}>{config.emptyText}</Text>
        )}

        {items !== null &&
          items.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemBody}>
              <Text
                style={[
                  styles.itemTitle,
                  config.toggle && !!item[config.toggle.field] && styles.itemDone,
                ]}>
                {String(item[config.titleField])}
              </Text>
              <Text style={styles.itemSummary}>{config.summary(item as never)}</Text>
            </View>
            <View style={styles.itemActions}>
              {config.toggle && (
                <Pressable
                  onPress={() => changeToggle(item.id)}
                  style={[
                    styles.pillAction,
                    {
                      backgroundColor: item[config.toggle!.field]
                        ? config.accent
                        : '#EDEBFA',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.pillActionText,
                      !!item[config.toggle!.field] && styles.pillActionTextSelected,
                    ]}>
                    {item[config.toggle!.field] ? config.toggle.labelOn : config.toggle.labelOff}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={() => openEdit(item)} hitSlop={8}>
                <Text style={styles.itemLink}>Editar</Text>
              </Pressable>
              {confirmDeleteId === item.id ? (
                <View style={styles.confirmRow}>
                  <Pressable onPress={() => setConfirmDeleteId(null)} hitSlop={8}>
                    <Text style={styles.itemLink}>No</Text>
                  </Pressable>
                  <Pressable onPress={() => remove(item.id)} hitSlop={8}>
                    <Text style={styles.itemDanger}>¡Sí, borrar!</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={() => setConfirmDeleteId(item.id)} hitSlop={8}>
                  <Text style={styles.itemDanger}>Borrar</Text>
                </Pressable>
              )}
            </View>
          </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF7F0' },

  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 3,
    borderBottomColor: '#FFB84C',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerText: { flexShrink: 1 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#4B4767', marginTop: 2 },
  countHint: { fontSize: 13, color: '#4B4767', marginLeft: 12 },

  body: { padding: 20, gap: 12 },

  addButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#6D28D9',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },

  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 2,
    borderColor: '#6D28D9',
  },
  formTitle: { fontSize: 18, fontWeight: '700', color: '#1E1B4B' },
  fieldWrap: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: '#1E1B4B' },
  input: {
    borderWidth: 2,
    borderColor: '#C9C4E5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1E1B4B',
    backgroundColor: '#FFFFFF',
  },
  inputInvalid: { borderColor: '#DC2626' },
  error: { fontSize: 12, fontWeight: '600', color: '#DC2626' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#EDEBFA',
  },
  chipText: { color: '#1E1B4B', fontWeight: '600', fontSize: 14 },
  chipTextSelected: { color: '#FFFFFF' },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#16A34A',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  cancelText: { color: '#6D28D9', fontWeight: '600', fontSize: 15 },

  empty: { fontSize: 15, color: '#4B4767', textAlign: 'center', marginTop: 24 },

  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 6,
    borderLeftColor: '#6D28D9',
  },
  itemBody: { marginBottom: 8 },
  itemTitle: { fontSize: 18, fontWeight: '700', color: '#1E1B4B' },
  itemDone: { textDecorationLine: 'line-through', color: '#9A96B8' },
  itemSummary: { fontSize: 14, color: '#4B4767', marginTop: 2, lineHeight: 20 },
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  pillAction: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  pillActionText: { color: '#1E1B4B', fontWeight: '700', fontSize: 13 },
  pillActionTextSelected: { color: '#FFFFFF' },
  itemLink: { color: '#6D28D9', fontWeight: '600', fontSize: 14 },
  itemDanger: { color: '#DC2626', fontWeight: '600', fontSize: 14 },
  confirmRow: { flexDirection: 'row', gap: 12 },
} as const);
