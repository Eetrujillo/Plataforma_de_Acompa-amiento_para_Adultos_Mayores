import { View } from 'react-native';

import { useTheme } from '../../theme/ThemeProvider';
import { AppText } from '../ui/AppText';
import type { ConsentText } from '../../types';

/**
 * Texto del consentimiento informado (HU-008).
 *
 * Se muestra igual en la vinculación y en los ajustes del adulto mayor. El
 * texto viene del backend (`GET /api/app/consent`) para poder actualizarlo sin
 * publicar una versión nueva de la app.
 */
export function ConsentContent({ consent }: { consent: ConsentText }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText>{consent.intro}</AppText>

      <View style={{ gap: theme.spacing.sm }}>
        {consent.items.map((item) => (
          <View key={item.title} style={{ gap: 4 }}>
            <AppText variant="label">{item.title}</AppText>
            <AppText variant="muted">{item.description}</AppText>
          </View>
        ))}
      </View>

      <AppText>{consent.closing}</AppText>
      <AppText variant="muted" style={{ fontSize: theme.font.small }}>
        {consent.legal}
      </AppText>
    </View>
  );
}
