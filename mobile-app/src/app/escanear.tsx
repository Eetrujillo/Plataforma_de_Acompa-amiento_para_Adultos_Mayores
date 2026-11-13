/**
 * /escanear — mobile-only vinculation scanner (S2, S3). Web never offers
 * scanning: this screen explains that web administers and consults (S6).
 * Outcomes:
 *  - guest (no session): local `adulto_mayor` session bound to the link (S2);
 *  - logged in: role becomes `cuidador`, bound to the link, admin unchanged
 *    (S3, S1/D1).
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { Button, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette, Radius, Spacing } from '@/constants/theme';
import {
  applyVinculoToLoggedInUser,
  getSession,
  loginGuestAdulto,
} from '@/services/auth';
import { acceptQrPayload, parseQrPayload } from '@/services/vinculos';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'invalid' }
  | { kind: 'unknown-vinculo' }
  | { kind: 'bound'; message: string };

export default function EscanearScreen() {
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  // onBarcodeScanned fires repeatedly for the same code: handle it once.
  const handledRef = useRef(false);

  if (Platform.OS === 'web') {
    // S6: the web administers and consults; scanning is app-only.
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: true, title: 'Escanear QR' }} />
        <View style={styles.center}>
          <Text style={styles.emoji}>📷</Text>
          <Text style={styles.title}>El escaneo está solo en la aplicación</Text>
          <Text style={styles.body}>
            Desde la web se administra y consulta la información. Para vincularse
            por QR, entrá desde la aplicación móvil en tu teléfono.
          </Text>
          <Text onPress={() => router.back()} style={styles.link}>
            ← Volver
          </Text>
        </View>
      </View>
    );
  }

  const restart = () => {
    handledRef.current = false;
    setOutcome({ kind: 'idle' });
  };

  const handleScan = async (scanningResult: { data: string }) => {
    if (handledRef.current) return;
    handledRef.current = true;

    const payload = parseQrPayload(scanningResult.data);
    if (!payload) {
      setOutcome({ kind: 'invalid' });
      return;
    }
    // The QR is self-verifiable: the device rebuilds the link locally.
    const vinculo = await acceptQrPayload(payload);
    if (!vinculo) {
      setOutcome({ kind: 'unknown-vinculo' });
      return;
    }

    const session = await getSession();
    if (!session || session.guest) {
      // S2: QR without an account -> local adulto_mayor session.
      await loginGuestAdulto(payload.code);
      setOutcome({
        kind: 'bound',
        message: `¡Vinculado! Entrás como Adulto mayor de ${vinculo.email}`,
      });
      return;
    }

    // S3: logged-in scan -> cuidador, admin untouched (S1).
    const updated = await applyVinculoToLoggedInUser(payload.code);
    if (!updated) {
      setOutcome({ kind: 'unknown-vinculo' });
      return;
    }
    setOutcome({
      kind: 'bound',
      message: `¡Vinculado, ${updated.name}! Ahora sos Cuidador de ${vinculo.email}`,
    });
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: 'Escanear QR' }} />

      {outcome.kind === 'bound' ? (
        <View style={styles.center}>
          <Text style={styles.emoji}>✅</Text>
          <Text style={styles.title}>Vinculación lista</Text>
          <Text style={styles.body}>{outcome.message}</Text>
          <Pressable
            onPress={() => router.replace('/dashboard')}
            style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Ir a mi panel</Text>
          </Pressable>
        </View>
      ) : outcome.kind === 'invalid' || outcome.kind === 'unknown-vinculo' ? (
        <View style={styles.center}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>
            {outcome.kind === 'invalid'
              ? 'Ese QR no es de vinculación'
              : 'Código de vinculación desconocido'}
          </Text>
          <Text style={styles.body}>
            Pedile a tu familiar el QR de vinculación y volvé a intentarlo.
          </Text>
          <Pressable onPress={restart} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Escanear de nuevo</Text>
          </Pressable>
        </View>
      ) : (
        <CameraSurface onScanned={handleScan} />
      )}
    </View>
  );
}

function CameraSurface({ onScanned }: { onScanned: (result: { data: string }) => void }) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return <View style={styles.center} />;
  }
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.body}>
          Para vincularse necesitamos usar la cámara. Concedé el permiso cuando
          el sistema lo pida.
        </Text>
        <Button title="Conceder permiso de cámara" onPress={() => void requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}>
        <View style={styles.frame}>
          <Text style={styles.frameHint}>
            Apuntá al QR de vinculación de tu familiar
          </Text>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surfaceAlt },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  cameraWrap: { flex: 1 },
  camera: { flex: 1 },
  frame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Spacing.xxl,
  },
  frameHint: {
    color: Palette.textOnBlock,
    fontSize: 16,
    fontWeight: '600' as const,
    backgroundColor: 'rgba(30,27,75,0.75)',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    textAlign: 'center',
  },
  emoji: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: '700' as const, color: Palette.ink, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24, color: Palette.inkSoft, textAlign: 'center', maxWidth: 320 },
  primaryButton: {
    backgroundColor: Palette.violet,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    marginTop: Spacing.sm,
  },
  primaryButtonText: { color: Palette.textOnBlock, fontWeight: '700' as const, fontSize: 16 },
  link: {
    color: Palette.violet,
    fontWeight: '600' as const,
    fontSize: 16,
    marginTop: Spacing.sm,
  },
});
