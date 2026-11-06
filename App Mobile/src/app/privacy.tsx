import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../components/ui/AppText';
import { Card } from '../components/ui/Card';
import { Screen } from '../components/ui/Screen';
import { useTheme } from '../theme/ThemeProvider';

/** Política de privacidad (misma versión 1.0 de la web). */
export default function PrivacyScreen() {
  const theme = useTheme();

  const sections: Array<{ title: string; body: string[] }> = [
    {
      title: 'Datos que recopilamos',
      body: [
        'Tu correo electrónico, usado como identificador de la cuenta.',
        'Tu contraseña, almacenada únicamente como un hash seguro; nunca se guarda en texto plano.',
        'La fecha y la versión de esta política que aceptaste al crear la cuenta.',
      ],
    },
    {
      title: 'Para qué usamos los datos',
      body: [
        'Crear y administrar tu cuenta de familiar.',
        'Permitirte gestionar las actividades y alertas de tu familiar.',
        'Mantener un registro del consentimiento otorgado para el tratamiento de datos.',
      ],
    },
    {
      title: 'Consentimiento',
      body: [
        'Al marcar la casilla de aceptación durante el registro, autorizas el tratamiento de tus datos para las finalidades descritas. Si no aceptas esta política, no es posible crear la cuenta.',
      ],
    },
    {
      title: 'Conservación y seguridad',
      body: [
        'Los datos se conservan mientras tu cuenta esté activa o durante el tiempo necesario para cumplir obligaciones legales. Aplicamos medidas técnicas para proteger la información, incluyendo el almacenamiento de contraseñas mediante hash.',
      ],
    },
    {
      title: 'Tus derechos',
      body: [
        'Puedes solicitar el acceso, la actualización, la corrección o la eliminación de tus datos, así como revocar el consentimiento, contactando al administrador de la plataforma.',
      ],
    },
  ];

  return (
    <Screen>
      <Card>
        <AppText variant="eyebrow">Información legal</AppText>
        <AppText variant="hero" accessibilityRole="header">
          Política de privacidad y tratamiento de datos
        </AppText>
        <AppText variant="muted">Versión 1.0</AppText>

        <AppText>
          Esta política explica qué datos personales recopila la Plataforma de Acompañamiento
          para Adultos Mayores, para qué los usa y cómo puedes ejercer tus derechos.
        </AppText>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <AppText variant="title" style={{ fontSize: theme.font.title * 0.72 }}>
              {section.title}
            </AppText>
            {section.body.map((paragraph) => (
              <AppText key={paragraph} variant="muted">
                {paragraph}
              </AppText>
            ))}
          </View>
        ))}

        <AppText variant="muted" style={{ fontSize: theme.font.small }}>
          Esta versión de la política debe ser revisada y aprobada por la institución
          responsable antes de su publicación definitiva.
        </AppText>

        <View style={styles.links}>
          <Link href="/register">
            <AppText style={{ color: theme.colors.primary, fontWeight: '700' }}>
              Volver al registro
            </AppText>
          </Link>
          <Link href="/login">
            <AppText style={{ color: theme.colors.primary, fontWeight: '700' }}>
              Iniciar sesión
            </AppText>
          </Link>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6, marginTop: 8 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 8 },
});
