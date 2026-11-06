import { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '../components/ui/AppText';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Notification } from '../components/ui/Notification';
import { RequireFamily } from '../components/auth/RequireAuth';
import { Screen } from '../components/ui/Screen';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../theme/ThemeProvider';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  teacher: 'Docente',
  student: 'Estudiante',
  familiar: 'Familiar',
};

/**
 * Panel del familiar (equivalente a `Dashboard.tsx`).
 *
 * Reúne los accesos a perfiles, actividades y estado del día. Antes se
 * refrescaba al volver a la pestaña; en móvil se hace al volver del segundo
 * plano con `AppState`.
 */
export default function PanelScreen() {
  return (
    <RequireFamily>
      <PanelContent />
    </RequireFamily>
  );
}

function PanelContent() {
  const theme = useTheme();
  const { user, logout, welcomePending, consumeWelcome, refreshUser } = useAuth();
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (welcomePending) {
      setShowWelcome(true);
      consumeWelcome();
    }
  }, [welcomePending, consumeWelcome]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshUser();
    });

    return () => subscription.remove();
  }, [refreshUser]);

  if (!user) return null;

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow="Sesión iniciada"
        title={`Hola, ${user.name}`}
        subtitle="Tu cuenta de familiar está conectada a la base de datos."
        actions={<Button label="Cerrar sesión" variant="secondary" onPress={handleLogout} block={false} />}
      />

      {showWelcome ? (
        <Notification type="success">
          ¡Bienvenido/a, {user.name}! Tu cuenta de familiar fue creada correctamente.
        </Notification>
      ) : null}

      <Card>
        <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
          Datos de la cuenta
        </AppText>

        <View style={styles.row}>
          <AppText variant="label">Nombre</AppText>
          <AppText variant="muted">{user.name}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="label">Correo</AppText>
          <AppText variant="muted">{user.email}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="label">Correo confirmado</AppText>
          <AppText variant="muted">{user.emailVerified ? 'Sí' : 'No'}</AppText>
        </View>
        <View style={styles.row}>
          <AppText variant="label">Rol</AppText>
          <AppText variant="muted">{ROLE_LABELS[user.role] ?? user.role}</AppText>
        </View>
        {user.privacyPolicy ? (
          <View style={styles.row}>
            <AppText variant="label">Política de privacidad</AppText>
            <AppText variant="muted">
              Versión {user.privacyPolicy.version} · aceptada el{' '}
              {new Date(user.privacyPolicy.acceptedAt).toLocaleDateString('es-CO')}
            </AppText>
          </View>
        ) : null}
      </Card>

      <Card>
        <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
          Mis adultos mayores
        </AppText>
        <AppText variant="muted">
          Registra el perfil de tu adulto mayor con su nombre, PIN y zona horaria.
        </AppText>
        <Button label="Gestionar perfiles" onPress={() => router.push('/adultos-mayores')} />
      </Card>

      <Card>
        <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
          Estado de hoy
        </AppText>
        <AppText variant="muted">
          Revisa si las actividades de hoy están pendientes, completadas o vencidas.
        </AppText>
        <Button label="Ver el día de hoy" onPress={() => router.push('/hoy')} />
      </Card>

      <Card>
        <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
          Actividades y rutina
        </AppText>
        <AppText variant="muted">
          Crea actividades una sola vez, todos los días o en los días que elijas. Tu adulto
          mayor las verá en su app.
        </AppText>
        <Button label="Gestionar actividades" onPress={() => router.push('/actividades')} />
      </Card>

      <Card>
        <AppText variant="title" style={{ fontSize: theme.font.title * 0.78 }}>
          App del adulto mayor
        </AppText>
        <AppText variant="muted">
          Si tu adulto mayor va a vincular su celular, puede abrir la app y escribir o escanear
          el código que le compartas.
        </AppText>
        <Button
          label="Abrir la app del adulto mayor"
          variant="secondary"
          onPress={() => router.push('/app')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2, paddingTop: 6 },
});
