/**
 * /mi-qr — the familiar's unique vinculation QR (S5), generated from their
 * unique email. Scanning it from the mobile app links a patient (S2) or a
 * caregiver (S3). Web can display and share it; only mobile scans (S6).
 */

import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import { brand } from '@/content';
import { Palette, Radius, Spacing } from '@/constants/theme';
import { ROLE_LABELS, getSession, type PublicUser } from '@/services/auth';
import { buildQrPayload, ensureVinculo, type Vinculo } from '@/services/vinculos';

export default function MiQrScreen() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);

  useEffect(() => {
    let active = true;
    getSession().then(async (session) => {
      if (!active || !session) return;
      setUser(session);
      // Every account owns exactly one link, derived from its unique email.
      const created = await ensureVinculo(session.email);
      if (active) setVinculo(created);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: true, title: 'Mi QR de vinculación' }} />

      <View style={styles.body}>
        {user && (
          <Text style={styles.who}>
            {user.name} · {ROLE_LABELS[user.role]}
          </Text>
        )}

        {vinculo ? (
          <>
            <View style={styles.qrCard}>
              <QRCode value={buildQrPayload(vinculo)} size={220} color={Palette.ink} />
            </View>
            <Text style={styles.codeLabel}>Código de vinculación</Text>
            <Text style={styles.code}>{vinculo.code}</Text>
            <Text style={styles.owner}>{vinculo.email}</Text>
            <Text style={styles.help}>
              Mostrá este QR para vincular a la persona que lo escanee con la
              aplicación: sin cuenta se une como {'"'}Adulto mayor{'"'}, con
              sesión abierta como {'"'}Cuidador{'"'}.
            </Text>
          </>
        ) : (
          <Text style={styles.help}>Cargando tu QR…</Text>
        )}

        <Text style={styles.brand}>{brand.name}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.surfaceAlt },
  body: { alignItems: 'center', padding: Spacing.xl, gap: Spacing.md },
  who: { fontSize: 16, fontWeight: '600' as const, color: Palette.inkSoft },

  qrCard: {
    backgroundColor: Palette.surface,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 3,
    borderColor: Palette.orange,
  },
  codeLabel: { fontSize: 13, fontWeight: '600' as const, color: Palette.inkSoft },
  code: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Palette.violet,
    letterSpacing: 1,
  },
  owner: { fontSize: 13, color: Palette.inkSoft },
  help: {
    fontSize: 14,
    lineHeight: 21,
    color: Palette.inkSoft,
    textAlign: 'center',
    maxWidth: 320,
  },
  brand: { fontSize: 12, color: Palette.inkSoft, marginTop: Spacing.md },
});
