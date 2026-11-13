import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getSession } from '@/services/auth';

/**
 * Session guard for every dashboard route (S1): no local session means
 * back to /auth before any module screen renders.
 */
export default function DashboardLayout() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    getSession().then((session) => {
      if (!active) return;
      if (session) {
        setChecked(true);
      } else {
        router.replace('/auth');
      }
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (!checked) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Cargando…</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FFF7F0' },
      }}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF7F0' },
  loadingText: { fontSize: 16, color: '#4B4767' },
});
