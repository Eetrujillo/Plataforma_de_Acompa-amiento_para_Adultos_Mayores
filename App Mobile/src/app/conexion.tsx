import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/ui/FormField';
import { Notification } from '../components/ui/Notification';
import { Screen } from '../components/ui/Screen';
import { DEFAULT_API_BASE } from '../config';
import {
  checkBackend,
  getApiBase,
  isCustomApiBase,
  normalizeApiBase,
  resetApiBase,
  setApiBase,
} from '../services/apiBase';

/**
 * Pantalla «Servidor».
 *
 * Sirve para apuntar la app al mismo backend que usa la web. Sin esto, un
 * teléfono con Expo Go intentaría `localhost`, que es el propio teléfono, y
 * nunca encontraría la API.
 *
 * La URL se guarda en el dispositivo; no hace falta recompilar ni reiniciar.
 */
export default function ServerScreen() {
  const [value, setValue] = useState(getApiBase());
  const [error, setError] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const currentBase = getApiBase();
  const usingCustom = isCustomApiBase();

  async function handleTest() {
    if (testing) return;

    const normalized = normalizeApiBase(value);

    if (!normalized) {
      setStatus(null);
      setError('Escribe una URL que empiece por http:// o https://, o la ruta /api.');
      return;
    }

    setError('');
    setStatus(null);
    setTesting(true);

    try {
      const result = await checkBackend(normalized);
      setStatus({ ok: result.ok, message: result.message });
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    const normalized = normalizeApiBase(value);

    if (!normalized) {
      setStatus(null);
      setError('Escribe una URL que empiece por http:// o https://, o la ruta /api.');
      return;
    }

    setApiBase(normalized);

    if (router.canGoBack()) router.back();
    else router.replace('/login');
  }

  function handleAuto() {
    resetApiBase();
    setValue(DEFAULT_API_BASE);
    setStatus(null);
    setError('');
  }

  return (
    <Screen>
      <Card>
        <AppText variant="eyebrow">Conexión</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Servidor de la plataforma
        </AppText>
        <AppText variant="muted">
          La web y esta app deben usar el mismo servidor para compartir la cuenta, los
          perfiles y las actividades.
        </AppText>

        <View style={styles.block}>
          <AppText variant="label">Dirección en uso</AppText>
          <AppText style={styles.mono}>{currentBase}</AppText>
          <AppText variant="value" style={styles.small}>
            {usingCustom ? 'Guardada en este dispositivo.' : 'Detectada automáticamente.'}
          </AppText>
        </View>

        <FormField
          label="Dirección del backend"
          value={value}
          onChangeText={(next) => {
            setValue(next);
            setError('');
            setStatus(null);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint={`Ejemplo: http://192.168.1.20:3500/api · automática: ${DEFAULT_API_BASE}`}
          error={error}
          editable={!testing}
        />

        <Notification type={status?.ok ? 'success' : 'error'}>{status?.message}</Notification>

        <Button
          label={testing ? 'Comprobando…' : 'Probar conexión'}
          onPress={() => void handleTest()}
          loading={testing}
          variant="secondary"
        />

        <Button label="Guardar y volver" onPress={handleSave} />

        {usingCustom ? (
          <Button label="Volver a la detección automática" onPress={handleAuto} variant="ghost" />
        ) : null}

        <View style={styles.block}>
          <AppText variant="muted" style={styles.small}>
            En un teléfono, «localhost» apunta al teléfono. Usa la IP del computador donde corre
            el backend, por ejemplo http://192.168.1.20:3500/api, y asegúrate de que ambos estén
            en la misma red.
          </AppText>
        </View>

        <Link href="/login">
          <AppText style={styles.link}>Volver a iniciar sesión</AppText>
        </Link>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 4 },
  mono: { fontFamily: 'monospace', fontSize: 18, fontWeight: '700', color: '#10202b' },
  small: { fontSize: 15 },
  link: { color: '#1f4e8c', fontWeight: '700' },
});
