import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DateField } from '../components/ui/DateField';
import { FormField } from '../components/ui/FormField';
import { LoadingState } from '../components/ui/LoadingState';
import { Notification } from '../components/ui/Notification';
import { RequireFamily } from '../components/auth/RequireAuth';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SelectField } from '../components/ui/SelectField';
import { TimeField } from '../components/ui/TimeField';
import { cardShadow } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { activityService } from '../services/activityService';
import { ApiError } from '../services/apiClient';
import { olderAdultService } from '../services/olderAdultService';
import type { Activity, OlderAdult, OlderAdultRepeatType } from '../types';
import {
  ACTIVITY_ICONS,
  REPEAT_OPTIONS,
  WEEKDAYS,
  formatDateLabel,
  formatRepeatSummary,
  formatTimeLabel,
  getTodayDateKey,
} from '../utils/activity';
import { DEFAULT_TIME_ZONE, getTimeZoneLabel } from '../utils/timeZones';

type FormMode = 'create' | 'edit';
type FieldName = 'olderAdultId' | 'title' | 'icon' | 'date' | 'time' | 'repeatType' | 'weekdays';
type FieldErrors = Partial<Record<FieldName, string>>;

interface FormState {
  olderAdultId: string;
  title: string;
  icon: string;
  date: string;
  time: string;
  repeatType: OlderAdultRepeatType;
  weekdays: number[];
}

const TITLE_MAX_LENGTH = 60;

function emptyForm(olderAdult?: OlderAdult): FormState {
  const timeZone = olderAdult?.timeZone ?? DEFAULT_TIME_ZONE;

  return {
    olderAdultId: olderAdult?._id ?? '',
    title: '',
    icon: 'medicina',
    date: getTodayDateKey(timeZone),
    time: '09:00',
    repeatType: 'once',
    weekdays: [],
  };
}

/**
 * HU-012 a HU-015 - Crear, editar, repetir y eliminar actividades.
 *
 * La hora se interpreta en la zona horaria del adulto mayor (la envía el
 * backend), mientras que la fecha inicial se calcula con esa misma zona. El
 * formulario vive en un modal para que en el teléfono quede a la vista del
 * teclado.
 */
export default function ActivitiesScreen() {
  return (
    <RequireFamily>
      <ActivitiesContent />
    </RequireFamily>
  );
}

function ActivitiesContent() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ olderAdultId?: string }>();

  const [adults, setAdults] = useState<OlderAdult[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [success, setSuccess] = useState('');

  const [mode, setMode] = useState<FormMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [pastOpen, setPastOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const selectedAdult = adults.find((adult) => adult._id === selectedId) ?? null;
  const selectedActivities = activities.filter(
    (activity) => !selectedId || activity.olderAdult === selectedId
  );

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [adultsResponse, activitiesResponse] = await Promise.all([
          olderAdultService.list(),
          activityService.list(),
        ]);

        if (!active) return;

        setAdults(adultsResponse.olderAdults);
        setActivities(activitiesResponse.activities);

        // HU-020: al llegar desde el estado del día, se abre el perfil pedido.
        const preferred =
          adultsResponse.olderAdults.find((adult) => adult._id === params.olderAdultId) ??
          adultsResponse.olderAdults.find((adult) => adult.linkStatus === 'linked') ??
          adultsResponse.olderAdults[0];

        if (preferred) {
          setSelectedId(preferred._id);
          setForm(emptyForm(preferred));
        }
      } catch (err) {
        if (!active) return;
        setListError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos cargar tus actividades. Inténtalo de nuevo.'
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
    // El perfil de la URL solo se usa en la primera carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectedChange(nextId: string) {
    const adult = adults.find((item) => item._id === nextId);

    setSelectedId(nextId);
    setMode(null);
    setEditingId(null);
    setForm(emptyForm(adult));
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(emptyForm(selectedAdult ?? undefined));
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function startEdit(activity: Activity) {
    setMode('edit');
    setEditingId(activity._id);
    setForm({
      olderAdultId: activity.olderAdult,
      title: activity.title,
      icon: activity.icon,
      date: activity.date,
      time: activity.time,
      repeatType: activity.repeatType,
      weekdays: activity.weekdays,
    });
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function cancelForm() {
    setMode(null);
    setEditingId(null);
    setForm(emptyForm(selectedAdult ?? undefined));
    setFieldErrors({});
    setFormError('');
  }

  function toggleWeekday(value: number) {
    setForm((current) => {
      const has = current.weekdays.includes(value);
      return {
        ...current,
        weekdays: has
          ? current.weekdays.filter((day) => day !== value)
          : [...current.weekdays, value],
      };
    });
    setFieldErrors((current) => ({ ...current, weekdays: undefined }));
  }

  function validate() {
    const nextErrors: FieldErrors = {};
    const title = form.title.trim();

    if (!form.olderAdultId) nextErrors.olderAdultId = 'Selecciona a tu adulto mayor.';

    if (!title) nextErrors.title = 'Ingresa el título de la actividad.';
    else if (title.length > TITLE_MAX_LENGTH) {
      nextErrors.title = 'El título no puede superar los 60 caracteres.';
    }

    if (!form.icon) nextErrors.icon = 'Selecciona un ícono para la actividad.';
    if (!form.date) nextErrors.date = 'Selecciona la fecha de la actividad.';
    if (!form.time) nextErrors.time = 'Selecciona la hora de la actividad.';

    if (form.repeatType === 'weekly' && form.weekdays.length === 0) {
      nextErrors.weekdays = 'Marca al menos un día de la semana.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function persist(confirmPast: boolean) {
    if (!validate()) return;

    const payload = {
      title: form.title.trim(),
      icon: form.icon,
      date: form.date,
      time: form.time,
      repeatType: form.repeatType,
      weekdays: form.repeatType === 'weekly' ? form.weekdays : [],
      confirmPast,
    };

    setSaving(true);
    setFormError('');
    setSuccess('');

    try {
      if (mode === 'edit' && editingId) {
        const response = await activityService.update(editingId, payload);
        setActivities((current) =>
          current.map((activity) =>
            activity._id === response.activity._id ? response.activity : activity
          )
        );
        setSuccess(
          'Actividad actualizada. Los días anteriores conservan sus datos y la app la verá en menos de 1 minuto.'
        );
      } else {
        const response = await activityService.create({
          olderAdultId: form.olderAdultId,
          ...payload,
        });
        setActivities((current) => [...current, response.activity]);
        setSuccess(
          'Actividad creada. Aparecerá en la app de tu adulto mayor en menos de 1 minuto.'
        );
      }

      setListError('');
      cancelForm();
      setPastOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'ACTIVITY_PAST_REQUIRES_CONFIRMATION') {
          setPastOpen(true);
        } else if (err.field && err.field in form) {
          setFieldErrors((current) => ({ ...current, [err.field as FieldName]: err.message }));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('No pudimos guardar la actividad. Inténtalo de nuevo.');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    setFormError('');

    try {
      await activityService.remove(deleteTarget._id);
      setActivities((current) => current.filter((activity) => activity._id !== deleteTarget._id));
      setSuccess(
        'Actividad eliminada. Dejará de aparecer y de generar recordatorios desde hoy; el historial anterior se conserva.'
      );
      setDeleteTarget(null);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : 'No pudimos eliminar la actividad. Inténtalo de nuevo.'
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  const timeZoneLabel = getTimeZoneLabel(selectedAdult?.timeZone ?? DEFAULT_TIME_ZONE);

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Actividades"
        title="Actividades de mi adulto mayor"
        subtitle="Crea la rutina diaria de tu adulto mayor. Solo puedes gestionar sus propias actividades."
        actions={
          <>
            <Button
              label="Volver al panel"
              variant="secondary"
              onPress={() => router.replace('/panel')}
              block={false}
            />
            <Button
              label="Ver el día de hoy"
              variant="secondary"
              onPress={() =>
                router.push(
                  selectedId
                    ? { pathname: '/hoy', params: { olderAdultId: selectedId } }
                    : '/hoy'
                )
              }
              block={false}
            />
            {mode === null && selectedAdult ? (
              <Button label="Crear actividad" onPress={startCreate} block={false} />
            ) : null}
          </>
        }
      />

      {success ? <Notification type="success">{success}</Notification> : null}
      {listError ? <Notification type="error">{listError}</Notification> : null}
      {formError && mode === null ? <Notification type="error">{formError}</Notification> : null}

      {loading ? (
        <Card>
          <LoadingState label="Cargando actividades…" />
        </Card>
      ) : adults.length === 0 ? (
        <Card>
          <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
            Aún no tienes un adulto mayor registrado
          </AppText>
          <AppText variant="muted">
            Primero registra el perfil de tu adulto mayor para poder crear sus actividades.
          </AppText>
          <Button label="Registrar adulto mayor" onPress={() => router.push('/adultos-mayores')} />
        </Card>
      ) : (
        <>
          <Card>
            <SelectField
              label="Adulto mayor"
              value={selectedId}
              onChange={handleSelectedChange}
              hint={
                selectedAdult
                  ? `Hora y zona horaria: ${timeZoneLabel}`
                  : 'Selecciona un adulto mayor.'
              }
              options={adults.map((adult) => ({
                value: adult._id,
                label: `${adult.name}${
                  adult.linkStatus === 'linked' ? '' : ' (pendiente de vincular)'
                }`,
              }))}
            />

            {selectedAdult && selectedAdult.linkStatus !== 'linked' ? (
              <Notification type="info">
                Este adulto mayor aún no ha vinculado su app. Las actividades quedarán listas y
                aparecerán cuando vincule su celular.
              </Notification>
            ) : null}
          </Card>

          <Card>
            <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
              Actividades registradas
            </AppText>
            <AppText variant="muted">
              La app del adulto mayor se actualiza automáticamente en menos de 1 minuto.
            </AppText>

            {selectedActivities.length === 0 ? (
              <AppText variant="muted">Este adulto mayor todavía no tiene actividades.</AppText>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                {selectedActivities.map((activity) => (
                  <View
                    key={activity._id}
                    style={[
                      styles.activityCard,
                      {
                        borderColor: theme.colors.border,
                        borderRadius: theme.radius.control,
                        backgroundColor: theme.colors.background,
                        padding: theme.spacing.sm,
                        gap: 6,
                      },
                    ]}
                  >
                    <View style={styles.activityTop}>
                      <AppText style={{ fontSize: 30 }}>{activity.iconEmoji}</AppText>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="title" style={{ fontSize: theme.font.title * 0.66 }}>
                          {activity.title}
                        </AppText>
                        <AppText variant="muted">
                          {activity.repeatType === 'once'
                            ? formatDateLabel(activity.date)
                            : `Desde el ${formatDateLabel(activity.date)}`}{' '}
                          · {formatTimeLabel(activity.time)}
                        </AppText>
                        <AppText variant="muted">Repetición: {activity.repeatSummary}</AppText>
                        <AppText variant="muted" style={{ fontSize: theme.font.small }}>
                          Zona horaria: {getTimeZoneLabel(activity.timeZone)}
                        </AppText>
                      </View>
                    </View>

                    <View style={{ gap: 8 }}>
                      <Button
                        label="Editar"
                        variant="secondary"
                        onPress={() => startEdit(activity)}
                      />
                      <Button
                        label="Eliminar"
                        variant="danger"
                        onPress={() => setDeleteTarget(activity)}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card>
        </>
      )}

      <Modal visible={mode !== null} animationType="slide" transparent onRequestClose={cancelForm}>
        <View style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]}>
          <SafeAreaView
            style={[
              styles.sheet,
              cardShadow,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                padding: theme.spacing.md,
                gap: theme.spacing.sm,
              },
            ]}
          >
            <ScrollView contentContainerStyle={{ gap: theme.spacing.sm }}>
              <AppText variant="title">
                {mode === 'create' ? 'Crear actividad' : 'Editar actividad'}
              </AppText>
              <AppText variant="muted">
                La hora se entiende en la zona horaria de tu adulto mayor:{' '}
                <AppText style={{ fontWeight: '800' }}>{timeZoneLabel}</AppText>.
              </AppText>

              {formError ? <Notification type="error">{formError}</Notification> : null}

              <FormField
                label="Título"
                value={form.title}
                onChangeText={(value) => {
                  setForm((current) => ({ ...current, title: value }));
                  setFieldErrors((current) => ({
                    ...current,
                    title:
                      value.length > TITLE_MAX_LENGTH
                        ? 'El título no puede superar los 60 caracteres.'
                        : undefined,
                  }));
                }}
                hint={`${form.title.length}/${TITLE_MAX_LENGTH} caracteres. Máximo 60.`}
                error={fieldErrors.title}
                maxLength={TITLE_MAX_LENGTH + 10}
                editable={!saving}
              />

              <View style={{ gap: 6 }}>
                <AppText variant="label">Ícono</AppText>
                <View style={styles.chips}>
                  {ACTIVITY_ICONS.map((icon) => {
                    const selected = form.icon === icon.key;

                    return (
                      <Pressable
                        key={icon.key}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setForm((current) => ({ ...current, icon: icon.key }));
                          setFieldErrors((current) => ({ ...current, icon: undefined }));
                        }}
                        style={[
                          styles.chip,
                          {
                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                            backgroundColor: selected ? theme.colors.infoBg : theme.colors.surface,
                            borderRadius: theme.radius.pill,
                            minHeight: 48,
                          },
                        ]}
                      >
                        <AppText>{icon.emoji}</AppText>
                        <AppText style={{ fontWeight: selected ? '800' : '500' }}>
                          {icon.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {fieldErrors.icon ? (
                  <AppText style={{ color: theme.colors.errorText, fontWeight: '700' }}>
                    {fieldErrors.icon}
                  </AppText>
                ) : null}
              </View>

              <DateField
                label="Fecha"
                value={form.date}
                onChange={(value) => setForm((current) => ({ ...current, date: value }))}
                error={fieldErrors.date}
              />

              <TimeField
                label="Hora"
                value={form.time}
                onChange={(value) => setForm((current) => ({ ...current, time: value }))}
                hint={`Hora de ${timeZoneLabel}.`}
                error={fieldErrors.time}
              />

              <SelectField
                label="Repetición"
                value={form.repeatType}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    repeatType: value as OlderAdultRepeatType,
                  }))
                }
                options={REPEAT_OPTIONS}
              />

              {form.repeatType === 'weekly' ? (
                <View style={{ gap: 6 }}>
                  <AppText variant="label">Días de la semana</AppText>
                  <View style={styles.chips}>
                    {WEEKDAYS.map((day) => {
                      const selected = form.weekdays.includes(day.value);

                      return (
                        <Pressable
                          key={day.value}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() => toggleWeekday(day.value)}
                          style={[
                            styles.chip,
                            {
                              borderColor: selected ? theme.colors.primary : theme.colors.border,
                              backgroundColor: selected
                                ? theme.colors.infoBg
                                : theme.colors.surface,
                              borderRadius: theme.radius.pill,
                              minHeight: 48,
                            },
                          ]}
                        >
                          <AppText style={{ fontWeight: selected ? '800' : '500' }}>
                            {day.label}
                          </AppText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {fieldErrors.weekdays ? (
                    <AppText style={{ color: theme.colors.errorText, fontWeight: '700' }}>
                      {fieldErrors.weekdays}
                    </AppText>
                  ) : null}
                </View>
              ) : null}

              <AppText variant="muted">
                Repetición:{' '}
                <AppText style={{ fontWeight: '800' }}>
                  {formatRepeatSummary(form.repeatType, form.weekdays)}
                </AppText>
              </AppText>

              <Button
                label={saving ? 'Guardando…' : mode === 'create' ? 'Crear actividad' : 'Guardar cambios'}
                onPress={() => void persist(false)}
                loading={saving}
              />
              <Button label="Cancelar" variant="secondary" onPress={cancelForm} disabled={saving} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <ConfirmDialog
        open={pastOpen}
        title="La fecha y hora ya pasaron"
        description="La fecha y hora que elegiste ya pasaron. ¿Deseas guardar la actividad de todos modos o prefieres corregir los datos?"
        confirmLabel="Sí, guardar"
        cancelLabel="Corregir datos"
        busy={saving}
        onConfirm={() => {
          setPastOpen(false);
          void persist(true);
        }}
        onCancel={() => setPastOpen(false)}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar actividad"
        description={
          deleteTarget
            ? `La actividad "${deleteTarget.title}" dejará de aparecer y de generar recordatorios desde hoy. El historial de los días anteriores se conserva. ¿Deseas eliminarla?`
            : ''
        }
        confirmLabel="Sí, eliminar"
        danger
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  activityCard: { borderWidth: 2 },
  activityTop: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backdrop: { flex: 1, justifyContent: 'center', padding: 12 },
  sheet: { maxHeight: '92%', borderWidth: 2, borderRadius: 16 },
});
