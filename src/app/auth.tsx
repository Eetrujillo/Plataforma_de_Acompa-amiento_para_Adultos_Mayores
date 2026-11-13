/**
 * /auth — dedicated page opened by the landing "Log in / Sign up" button (S5).
 * Design-only delivery (S7): working client-side visual validation and
 * navigation, no backend in this milestone. Ready to plug an API later.
 */

import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brand } from '@/content';
import * as authService from '@/services/auth';
import type { Role } from '@/services/auth';
import { ensureVinculo } from '@/services/vinculos';
import { Palette, Radius, Spacing } from '@/constants/theme';

type Mode = 'login' | 'register';

interface FieldState {
  value: string;
  touched: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailError(value: string): string | null {
  if (!value.trim()) return 'Ingresá tu correo';
  if (!EMAIL_RE.test(value.trim())) return 'El correo no parece válido';
  return null;
}

function passwordError(value: string, mode: Mode): string | null {
  if (!value) return 'Ingresá tu contraseña';
  if (mode === 'register' && value.length < 6) return 'Debe tener al menos 6 caracteres';
  return null;
}

function nameError(value: string, mode: Mode): string | null {
  if (mode === 'register' && !value.trim()) return 'Ingresá tu nombre';
  return null;
}

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [role, setRole] = useState<Role>('adulto_mayor');
  const [name, setName] = useState<FieldState>({ value: '', touched: false });
  const [email, setEmail] = useState<FieldState>({ value: '', touched: false });
  const [password, setPassword] = useState<FieldState>({ value: '', touched: false });

  const emailErr = email.touched ? emailError(email.value) : null;
  const passwordErr = password.touched ? passwordError(password.value, mode) : null;
  const nameErr = name.touched ? nameError(name.value, mode) : null;

  // An open session goes straight to the dashboard.
  useEffect(() => {
    authService.getSession().then((session) => {
      if (session) router.replace('/dashboard');
    });
  }, [router]);

  const onSubmit = async () => {
    if (submitting) return;
    // Reveal every validation message before calling the service.
    setName({ value: name.value, touched: true });
    setEmail({ value: email.value, touched: true });
    setPassword({ value: password.value, touched: true });

    const valid =
      emailError(email.value) == null &&
      passwordError(password.value, mode) == null &&
      nameError(name.value, mode) == null;
    if (!valid) return;

    setSubmitting(true);
    setFormError(null);
    const isWeb = Platform.OS === 'web';
    // Mobile login enters as `familiar` (S4); web keeps the chosen role (S6).
    const result =
      mode === 'login'
        ? await authService.login(
            email.value,
            password.value,
            isWeb ? undefined : { roleOverride: 'familiar' },
          )
        : await authService.register(
            name.value,
            email.value,
            password.value,
            isWeb ? role : 'familiar',
          );
    if (result.ok) {
      // Every account owns its unique link code (S5); ensure it exists.
      await ensureVinculo(result.user.email);
    }
    setSubmitting(false);

    if (result.ok) {
      router.replace('/dashboard');
    } else {
      setFormError(result.message);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    // A mode switch changes the rules: keep values, reset visual validation.
    setName((f) => ({ ...f, touched: false }));
    setEmail((f) => ({ ...f, touched: false }));
    setPassword((f) => ({ ...f, touched: false }));
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen
        options={{ headerShown: true, headerTitle: '', headerBackVisible: true }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.body}>
        <View style={styles.logoBadge}>
          <Text style={styles.logoText}>{brand.shortName}</Text>
        </View>
        <Text style={styles.title}>{brand.name}</Text>

        {/* Mode toggle: Log in / Sign up */}
        <View style={styles.toggleRow}>
          <Pressable
            onPress={() => switchMode('login')}
            style={[styles.toggleButton, mode === 'login' && styles.toggleActiveViolet]}>
            <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>
              Ingresar
            </Text>
          </Pressable>
          <Pressable
            onPress={() => switchMode('register')}
            style={[styles.toggleButton, mode === 'register' && styles.toggleActiveOrange]}>
            <Text style={[styles.toggleText, mode === 'register' && styles.toggleTextActive]}>
              Crear cuenta
            </Text>
          </Pressable>
        </View>

        <View style={styles.formCard}>
          {mode === 'register' && Platform.OS === 'web' && (
            <>
              <View style={styles.roleWrap}>
                <Text style={styles.fieldLabel}>Rol</Text>
                <View style={styles.roleRow}>
                  {authService.ROLES.map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => setRole(option)}
                      style={[styles.roleChip, role === option && styles.roleChipActive]}>
                      <Text
                        style={[
                          styles.roleChipText,
                          role === option && styles.roleChipTextActive,
                        ]}>
                        {authService.ROLE_LABELS[option]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Field
                label="Nombre y apellido"
              placeholder="Nombre y apellido"
              value={name.value}
              error={nameErr}
              onChangeText={(value) => setName({ value, touched: name.touched })}
              onBlur={() => name.value !== '' && setName({ value: name.value, touched: true })}
              autoCapitalize="words"
            />
            </>
          )}
          <Field
            label="Correo electrónico"
            placeholder="Correo electrónico"
            value={email.value}
            error={emailErr}
            onChangeText={(value) => setEmail({ value, touched: email.touched })}
            onBlur={() => email.value !== '' && setEmail({ value: email.value, touched: true })}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Contraseña"
            placeholder="Contraseña"
            value={password.value}
            error={passwordErr}
            onChangeText={(value) => setPassword({ value, touched: password.touched })}
            onBlur={() =>
              password.value !== '' && setPassword({ value: password.value, touched: true })
            }
            secureTextEntry
          />

          {formError && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{formError}</Text>
            </View>
          )}

          <Pressable onPress={onSubmit} style={[styles.submitButton, submitting && styles.submitDisabled]}>
            <Text style={styles.submitButtonText}>
              {submitting
                ? 'Guardando…'
                : mode === 'login'
                  ? 'Ingresar'
                  : 'Crear mi cuenta'}
            </Text>
          </Pressable>

          <Text style={styles.hint}>
            Autenticación local: tus datos se guardan únicamente en este
            dispositivo/navegador. Más adelante se conecta al servidor.
          </Text>
        </View>

        {Platform.OS !== 'web' && (
          <Link href="/escanear" asChild>
            <Pressable hitSlop={12}>
              <Text style={styles.scanLink}>📷 Vincularme escaneando un QR</Text>
            </Pressable>
          </Link>
        )}

        <Link href="/" asChild>
          <Pressable hitSlop={12}>
            <Text style={styles.backLink}>← Volver a la página principal</Text>
          </Pressable>
        </Link>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: {
  label: string;
  placeholder: string;
  value: string;
  error: string | null;
  onChangeText: (value: string) => void;
  onBlur: () => void;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  keyboardType?: 'default' | 'email-address';
  secureTextEntry?: boolean;
}) {
  const invalid = props.error != null;
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={[styles.input, invalid && styles.inputInvalid]}
        placeholder={props.placeholder}
        value={props.value}
        onChangeText={props.onChangeText}
        onBlur={props.onBlur}
        autoCapitalize={props.autoCapitalize}
        keyboardType={props.keyboardType}
        secureTextEntry={props.secureTextEntry}
      />
      {!!props.error && <Text style={styles.fieldError}>{props.error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surfaceAlt },
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },

  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    backgroundColor: Palette.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: Palette.textOnBlock, fontWeight: '800' as const, fontSize: 20 },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Palette.ink,
    textAlign: 'center',
  },

  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  toggleButton: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    backgroundColor: Palette.surface,
    borderWidth: 2,
    borderColor: Palette.violet,
  },
  toggleActiveViolet: { backgroundColor: Palette.violet },
  toggleActiveOrange: { backgroundColor: Palette.orange, borderColor: Palette.orange },
  toggleText: { color: Palette.violet, fontWeight: '700' as const, fontSize: 16 },
  toggleTextActive: { color: Palette.textOnBlock },

  formCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  fieldWrap: { gap: 4 },
  input: {
    borderWidth: 2,
    borderColor: Palette.inkSoft,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 18,
    color: Palette.ink,
    backgroundColor: Palette.surface,
  },
  inputInvalid: { borderColor: Palette.danger },
  fieldLabel: { fontSize: 14, fontWeight: '600' as const, color: Palette.ink },
  fieldError: { fontSize: 13, fontWeight: '600' as const, color: Palette.danger },

  submitButton: {
    backgroundColor: Palette.violet,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  submitButtonText: { color: Palette.textOnBlock, fontWeight: '700' as const, fontSize: 18 },
  hint: { fontSize: 13, color: Palette.inkSoft, textAlign: 'center' },
  roleWrap: { gap: 4 },
  roleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  roleChip: {
    borderRadius: Radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Palette.surface,
    borderWidth: 2,
    borderColor: Palette.inkSoft,
  },
  roleChipActive: { backgroundColor: Palette.violet, borderColor: Palette.violet },
  roleChipText: { color: Palette.ink, fontWeight: '600' as const, fontSize: 13 },
  roleChipTextActive: { color: Palette.textOnBlock },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  errorBannerText: { color: Palette.danger, fontWeight: '600' as const, fontSize: 14 },
  submitDisabled: { opacity: 0.6 },
  scanLink: {
    marginTop: Spacing.sm,
    color: Palette.orangeDark,
    fontWeight: '700' as const,
    fontSize: 16,
  },
  backLink: {
    marginTop: Spacing.md,
    color: Palette.violet,
    fontWeight: '600' as const,
    fontSize: 16,
  },
});
