import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { FormField } from '../components/ui/FormField';
import { LoadingState } from '../components/ui/LoadingState';
import { Notification } from '../components/ui/Notification';
import { RequireFamily } from '../components/auth/RequireAuth';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { SelectField } from '../components/ui/SelectField';
import { cardShadow } from '../theme';
import { useTheme } from '../theme/ThemeProvider';
import { ApiError } from '../services/apiClient';
import { olderAdultService } from '../services/olderAdultService';
import type { OlderAdult, OlderAdultLinkingCode } from '../types';
import {
  DEFAULT_TIME_ZONE,
  getTimeZoneLabel,
  getTimeZoneOptions,
} from '../utils/timeZones';

type FormMode = 'create' | 'edit';
type FieldName = 'name' | 'pin' | 'timeZone';
type FieldErrors = Partial<Record<FieldName, string>>;

interface FormState {
  name: string;
  pin: string;
  timeZone: string;
}

interface LinkingCodeView {
  olderAdultId: string;
  olderAdultName: string;
  timeZone: string;
  code: OlderAdultLinkingCode;
}

const EMPTY_FORM: FormState = { name: '', pin: '', timeZone: DEFAULT_TIME_ZONE };
const PIN_REGEX = /^\d{4}$/;

function linkStatusLabel(status: OlderAdult['linkStatus']) {
  return status === 'pending' ? 'Pendiente de vincular' : 'Vinculado';
}

function formatExpiration(expiresAt: string, timeZone: string) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return expiresAt;

  try {
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone,
    }).format(date);
  } catch {
    return date.toLocaleString('es-CO');
  }
}

/**
 * HU-005, HU-006 y HU-010 - Perfiles, código de vinculación y desvinculación.
 *
 * La lista sólo muestra los perfiles del familiar autenticado (lo garantiza el
 * backend con `familiar: req.user._id`). El QR se muestra con la imagen que
 * genera el backend (`qrDataUrl`), igual que en la web.
 */
export default function OlderAdultsScreen() {
  return (
    <RequireFamily>
      <OlderAdultsContent />
    </RequireFamily>
  );
}

function OlderAdultsContent() {
  const theme = useTheme();
  const [olderAdults, setOlderAdults] = useState<OlderAdult[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [success, setSuccess] = useState('');

  const [mode, setMode] = useState<FormMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [linkingCode, setLinkingCode] = useState<LinkingCodeView | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const [unlinkTarget, setUnlinkTarget] = useState<OlderAdult | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState('');

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await olderAdultService.list();
        if (active) setOlderAdults(response.olderAdults);
      } catch (err) {
        if (!active) return;
        setListError(
          err instanceof ApiError
            ? err.message
            : 'No pudimos cargar tus adultos mayores. Inténtalo de nuevo.'
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  function startCreate() {
    setMode('create');
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function startEdit(olderAdult: OlderAdult) {
    setMode('edit');
    setEditingId(olderAdult._id);
    setForm({ name: olderAdult.name, pin: '', timeZone: olderAdult.timeZone });
    setFieldErrors({});
    setFormError('');
    setSuccess('');
  }

  function cancelForm() {
    setMode(null);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError('');
  }

  function validate() {
    const nextErrors: FieldErrors = {};
    const name = form.name.trim();
    const pin = form.pin.trim();

    if (!name) nextErrors.name = 'Ingresa el nombre de tu adulto mayor.';
    else if (name.length < 2) nextErrors.name = 'El nombre debe tener al menos 2 caracteres.';
    else if (name.length > 80) nextErrors.name = 'El nombre no puede superar los 80 caracteres.';

    if (mode === 'create' && !pin) nextErrors.pin = 'Ingresa el PIN de tu adulto mayor.';
    else if (pin && !PIN_REGEX.test(pin)) nextErrors.pin = 'El PIN debe tener exactamente 4 números.';

    if (!form.timeZone.trim()) nextErrors.timeZone = 'Selecciona una zona horaria válida.';

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit() {
    if (!mode || submitting || !validate()) return;

    const name = form.name.trim();
    const pin = form.pin.trim();
    const timeZone = form.timeZone;

    setSubmitting(true);
    setFormError('');
    setSuccess('');

    try {
      if (mode === 'create') {
        const response = await olderAdultService.create({ name, pin, timeZone });
        setOlderAdults((current) => [response.olderAdult, ...current]);
        setSuccess(response.message ?? 'Perfil creado. Queda pendiente de vincular.');
      } else {
        if (!editingId) return;

        const payload = pin ? { name, pin, timeZone } : { name, timeZone };
        const response = await olderAdultService.update(editingId, payload);
        setOlderAdults((current) =>
          current.map((item) => (item._id === response.olderAdult._id ? response.olderAdult : item))
        );
        setSuccess(response.message ?? 'Perfil actualizado.');
      }

      setListError('');
      cancelForm();
    } catch (err) {
      if (err instanceof ApiError) {
        const field = err.field;
        if (field === 'name' || field === 'pin' || field === 'timeZone') {
          setFieldErrors((current) => ({ ...current, [field]: err.message }));
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError('No pudimos guardar el perfil. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateLinkingCode(olderAdult: OlderAdult) {
    if (olderAdult.linkStatus === 'linked' || generatingId) return;

    setGeneratingId(olderAdult._id);
    setLinkError('');
    setCopyStatus('');
    setSuccess('');

    try {
      const response = await olderAdultService.generateLinkingCode(olderAdult._id);

      setOlderAdults((current) =>
        current.map((item) =>
          item._id === response.olderAdult._id ? response.olderAdult : item
        )
      );
      setLinkingCode({
        olderAdultId: response.olderAdult._id,
        olderAdultName: response.olderAdult.name,
        timeZone: response.olderAdult.timeZone,
        code: response.linkingCode,
      });
      setSuccess(response.message ?? 'Código de vinculación generado.');
    } catch (err) {
      if (err instanceof ApiError) {
        setLinkError(err.message);

        if (err.code === 'OLDER_ADULT_ALREADY_LINKED') {
          setOlderAdults((current) =>
            current.map((item) =>
              item._id === olderAdult._id ? { ...item, linkStatus: 'linked' } : item
            )
          );
          setLinkingCode((current) =>
            current?.olderAdultId === olderAdult._id ? null : current
          );
        }
      } else {
        setLinkError('No pudimos generar el código. Inténtalo de nuevo.');
      }
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleCopyCode() {
    if (!linkingCode) return;

    try {
      await Clipboard.setStringAsync(linkingCode.code.code);
      setCopyStatus('Código copiado. Puedes enviarlo por otro medio.');
    } catch {
      setCopyStatus('No pudimos copiar el código. Escribe el que aparece en pantalla.');
    }
  }

  async function handleUnlink() {
    if (!unlinkTarget || unlinking) return;

    setUnlinking(true);
    setUnlinkError('');
    setSuccess('');

    try {
      const response = await olderAdultService.unlink(unlinkTarget._id);

      setOlderAdults((current) =>
        current.map((item) =>
          item._id === response.olderAdult._id ? response.olderAdult : item
        )
      );
      setLinkingCode((current) =>
        current?.olderAdultId === unlinkTarget._id ? null : current
      );
      setCopyStatus('');
      setSuccess(
        response.message ??
          'Adulto mayor desvinculado. Su app dejará de mostrar actividades y alertas.'
      );
      setUnlinkTarget(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OLDER_ADULT_NOT_LINKED') {
        setOlderAdults((current) =>
          current.map((item) =>
            item._id === unlinkTarget._id ? { ...item, linkStatus: 'pending' } : item
          )
        );
        setLinkingCode((current) =>
          current?.olderAdultId === unlinkTarget._id ? null : current
        );
      }

      setUnlinkError(
        err instanceof ApiError
          ? err.message
          : 'No pudimos desvincular al adulto mayor. Inténtalo de nuevo.'
      );
      setUnlinkTarget(null);
    } finally {
      setUnlinking(false);
    }
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Adultos mayores"
        title="Mis adultos mayores"
        subtitle="Registra y actualiza los perfiles que acompañarás desde tu cuenta."
        actions={
          <>
            <Button
              label="Volver al panel"
              variant="secondary"
              onPress={() => router.replace('/panel')}
              block={false}
            />
            {mode === null ? (
              <Button label="Registrar adulto mayor" onPress={startCreate} block={false} />
            ) : null}
          </>
        }
      />

      {success ? <Notification type="success">{success}</Notification> : null}
      {linkError && mode === null ? <Notification type="error">{linkError}</Notification> : null}
      {unlinkError && mode === null ? (
        <Notification type="error">{unlinkError}</Notification>
      ) : null}
      {listError && mode === null ? <Notification type="error">{listError}</Notification> : null}

      <Card>
        <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
          Perfiles registrados
        </AppText>
        <AppText variant="muted">Solo ves los perfiles creados desde tu cuenta.</AppText>

        {loading ? (
          <LoadingState label="Cargando perfiles…" />
        ) : olderAdults.length === 0 ? (
          <AppText variant="muted">Aún no has registrado a tu adulto mayor.</AppText>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {olderAdults.map((olderAdult) => (
              <View
                key={olderAdult._id}
                style={[
                  styles.adultCard,
                  {
                    borderColor: theme.colors.border,
                    borderRadius: theme.radius.control,
                    backgroundColor: theme.colors.background,
                    padding: theme.spacing.sm,
                    gap: 6,
                  },
                ]}
              >
                <AppText variant="title" style={{ fontSize: theme.font.title * 0.68 }}>
                  {olderAdult.name}
                </AppText>
                <AppText variant="muted">
                  Zona horaria: {getTimeZoneLabel(olderAdult.timeZone)}
                </AppText>
                <AppText variant="muted">
                  PIN: {olderAdult.pinConfigured ? 'configurado' : 'sin configurar'}
                </AppText>
                <AppText variant="muted">
                  Estado: <AppText style={{ fontWeight: '800' }}>{linkStatusLabel(olderAdult.linkStatus)}</AppText>
                </AppText>

                <View style={{ gap: 8, marginTop: 4 }}>
                  {olderAdult.linkStatus === 'pending' ? (
                    <Button
                      label={
                        generatingId === olderAdult._id
                          ? 'Generando…'
                          : 'Generar código de vinculación'
                      }
                      onPress={() => void handleGenerateLinkingCode(olderAdult)}
                      loading={generatingId === olderAdult._id}
                      disabled={generatingId !== null}
                    />
                  ) : (
                    <Button
                      label="Desvincular"
                      variant="danger"
                      onPress={() => {
                        setUnlinkError('');
                        setSuccess('');
                        setUnlinkTarget(olderAdult);
                      }}
                    />
                  )}

                  <Button
                    label="Editar"
                    variant="secondary"
                    onPress={() => startEdit(olderAdult)}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* Formulario de crear/editar en modal: en pantalla pequeña evita una
          página larguísima y deja el teclado sobre el campo activo. */}
      <Modal
        visible={mode !== null}
        animationType="slide"
        transparent
        onRequestClose={cancelForm}
      >
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
                {mode === 'create' ? 'Registrar adulto mayor' : 'Editar perfil'}
              </AppText>
              <AppText variant="muted">
                {mode === 'create'
                  ? 'El perfil quedará pendiente de vincular a la app de tu adulto mayor.'
                  : 'Puedes cambiar el nombre, la zona horaria o el PIN.'}
              </AppText>

              {formError ? <Notification type="error">{formError}</Notification> : null}

              <FormField
                label="Nombre"
                value={form.name}
                onChangeText={(value) => {
                  setForm((current) => ({ ...current, name: value }));
                  setFieldErrors((current) => ({ ...current, name: undefined }));
                }}
                hint="Nombre de tu adulto mayor."
                maxLength={80}
                error={fieldErrors.name}
                editable={!submitting}
              />

              <FormField
                label="PIN"
                value={form.pin}
                onChangeText={(value) => {
                  setForm((current) => ({ ...current, pin: value.replace(/\D/g, '').slice(0, 4) }));
                  setFieldErrors((current) => ({ ...current, pin: undefined }));
                }}
                keyboardType="number-pad"
                secureTextEntry
                hint={
                  mode === 'create'
                    ? 'Exactamente 4 números.'
                    : 'Déjalo vacío para conservar el PIN actual.'
                }
                error={fieldErrors.pin}
                editable={!submitting}
              />

              <SelectField
                label="Zona horaria"
                value={form.timeZone}
                onChange={(value) => {
                  setForm((current) => ({ ...current, timeZone: value }));
                  setFieldErrors((current) => ({ ...current, timeZone: undefined }));
                }}
                options={getTimeZoneOptions(form.timeZone)}
                hint="Si no eliges otra, se usa America/Bogota (Colombia)."
                error={fieldErrors.timeZone}
              />

              <Button
                label={submitting ? 'Guardando…' : mode === 'create' ? 'Crear perfil' : 'Guardar cambios'}
                onPress={() => void handleSubmit()}
                loading={submitting}
              />
              <Button label="Cancelar" variant="secondary" onPress={cancelForm} disabled={submitting} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Código de vinculación: texto grande, QR y copiar. */}
      <Modal
        visible={linkingCode !== null}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setLinkingCode(null);
          setCopyStatus('');
        }}
      >
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
              <AppText variant="title">Código de vinculación</AppText>
              {linkingCode ? (
                <>
                  <AppText variant="muted">Para {linkingCode.olderAdultName}</AppText>
                  <AppText variant="muted">
                    Compártelo solo con tu adulto mayor. Vence el{' '}
                    <AppText style={{ fontWeight: '800' }}>
                      {formatExpiration(linkingCode.code.expiresAt, linkingCode.timeZone)}
                    </AppText>{' '}
                    ({getTimeZoneLabel(linkingCode.timeZone)}) y sirve una sola vez.
                  </AppText>

                  <AppText
                    accessibilityLabel={`Código de vinculación ${linkingCode.code.code}`}
                    style={styles.code}
                  >
                    {linkingCode.code.code}
                  </AppText>

                  <Button label="Copiar código" onPress={() => void handleCopyCode()} />
                  {copyStatus ? <Notification type="info">{copyStatus}</Notification> : null}

                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Image
                      source={{ uri: linkingCode.code.qrDataUrl }}
                      style={styles.qr}
                      accessibilityLabel={`Código QR de vinculación para ${linkingCode.olderAdultName}`}
                      resizeMode="contain"
                    />
                    <AppText variant="muted">
                      Escanea el QR desde la app del adulto mayor.
                    </AppText>
                  </View>

                  <AppText variant="muted">
                    Si generas un código nuevo, este dejará de funcionar.
                  </AppText>
                </>
              ) : null}

              <Button
                label="Cerrar"
                variant="secondary"
                onPress={() => {
                  setLinkingCode(null);
                  setCopyStatus('');
                }}
              />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      <ConfirmDialog
        open={unlinkTarget !== null}
        title="Desvincular a tu adulto mayor"
        description={
          unlinkTarget
            ? `La app de ${unlinkTarget.name} dejará de mostrar actividades y alertas, y tú dejarás de recibir sus datos. El historial de actividades se conserva y podrás generar un código nuevo cuando quieras. ¿Deseas desvincularlo?`
            : ''
        }
        confirmLabel="Sí, desvincular"
        danger
        busy={unlinking}
        onConfirm={() => void handleUnlink()}
        onCancel={() => setUnlinkTarget(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  adultCard: { borderWidth: 2 },
  backdrop: { flex: 1, justifyContent: 'center', padding: 12 },
  sheet: {
    maxHeight: '92%',
    borderWidth: 2,
    borderRadius: 16,
  },
  code: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
    paddingVertical: 10,
  },
  qr: { width: 220, height: 220 },
});
