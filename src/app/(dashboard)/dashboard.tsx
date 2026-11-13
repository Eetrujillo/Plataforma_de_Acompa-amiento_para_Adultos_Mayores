/**
 * Dashboard home (S3): welcome, four module cards and logout. Same content
 * for both platforms, colorful/energetic cards for each module.
 */

import { Link, Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { brand } from '@/content';
import { dashboardModules } from '@/modules/registry';
import * as authService from '@/services/auth';
import type { PublicUser } from '@/services/auth';
import { ROLE_LABELS } from '@/services/auth';

export default function DashboardHome() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);

  useEffect(() => {
    let active = true;
    authService.getSession().then((session) => {
      if (active) setUser(session);
    });
    return () => {
      active = false;
    };
  }, []);

  const onLogout = async () => {
    await authService.logout();
    router.replace('/auth');
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar */}
      <View style={styles.topbar}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>{brand.shortName}</Text>
          </View>
          <Text style={styles.brandTitle} numberOfLines={1}>
            {Platform.OS === 'web' ? brand.name : 'Mi panel'}
          </Text>
        </View>
        <Pressable onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.welcome}>
          {user ? `Hola, ${user.name} 👋` : 'Hola 👋'}
        </Text>
        <Text style={styles.welcomeSub}>
          {Platform.OS === 'web'
            ? 'Elegí un módulo para continuar gestionando el tratamiento:'
            : '¿Qué querés hacer ahora?'}
        </Text>
        {user && (
          <View style={[styles.roleBadge, user.role === 'admin' && styles.roleBadgeAdmin]}>
            <Text style={styles.roleBadgeText}>
              {user.role === 'admin' ? '⭐ ' : ''}{ROLE_LABELS[user.role]}
            </Text>
          </View>
        )}
        {user?.role === 'familiar' && !user.guest && (
          <Link href="/mi-qr" asChild>
            <Pressable style={styles.qrButton} hitSlop={8}>
              <Text style={styles.qrButtonText}>📷 Mi QR de vinculación</Text>
            </Pressable>
          </Link>
        )}
        {Platform.OS !== 'web' && user && !user.guest && user.role !== 'admin' && (
          <Link href="/escanear" asChild>
            <Pressable style={styles.qrButton} hitSlop={8}>
              <Text style={styles.qrButtonText}>📷 Escanear QR de vinculación</Text>
            </Pressable>
          </Link>
        )}
        {user?.vinculo && (
          <Text style={styles.vinculoHint}>
            Vinculado al círculo {user.vinculo.slice(0, 8)}…
          </Text>
        )}

        <View style={styles.cardRow}>
          {dashboardModules.map((module) => (
            <Link key={module.route} href={module.route as never} asChild>
              <Pressable style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardEmoji}>{module.emoji}</Text>
                  <Text style={styles.cardTitle}>
                    {Platform.OS === 'web' ? module.title : module.titleMobile}
                  </Text>
                </View>
                <Text style={styles.cardDescription}>{module.description}</Text>
                <Text style={styles.cardLink}>Abrir ›</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF7F0' },

  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Platform.OS === 'web' ? 24 : 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 3,
    borderBottomColor: '#FFB84C',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#6D28D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  brandTitle: { fontSize: 16, fontWeight: '700', color: '#1E1B4B', maxWidth: 280 },
  logoutButton: {
    borderWidth: 2,
    borderColor: '#1E1B4B',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  logoutText: { color: '#1E1B4B', fontWeight: '700', fontSize: 14 },

  body: { padding: 24, gap: 8 },
  welcome: { fontSize: 30, fontWeight: '700', color: '#1E1B4B' },
  welcomeSub: { fontSize: 16, color: '#4B4767', marginBottom: 8 },

  cardRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  card: {
    flexGrow: 1,
    flexBasis: Platform.OS === 'web' ? 220 : '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#FFB84C',
    padding: 20,
    shadowColor: '#6D28D9',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  cardEmoji: { fontSize: 28 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#1E1B4B' },
  cardDescription: { fontSize: 14, lineHeight: 20, color: '#4B4767', marginBottom: 10 },
  cardLink: { color: '#6D28D9', fontWeight: '700', fontSize: 15 },

  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDEBFA',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  roleBadgeAdmin: { backgroundColor: '#FEF3C7' },
  roleBadgeText: { color: '#1E1B4B', fontWeight: '700', fontSize: 14 },
  qrButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#EC4899',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  qrButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  vinculoHint: { fontSize: 12, color: '#4B4767', marginBottom: 8 },
} as const);
