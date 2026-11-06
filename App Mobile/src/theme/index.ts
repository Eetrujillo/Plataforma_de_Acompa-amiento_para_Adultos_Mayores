/**
 * Tokens visuales de la app.
 *
 * En React Native no hay CSS: cada medida es un número en puntos. Se conservan
 * los valores de la versión web para que la app se vea igual en web y en móvil.
 *
 * Regla de accesibilidad del proyecto:
 * - Pantallas del familiar: texto base 18.
 * - Pantallas del adulto mayor: texto base 20, controles de 52 puntos o más,
 *   alto contraste y foco visible.
 */

export interface AppTheme {
  mode: 'family' | 'senior';
  colors: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    primary: string;
    primaryHover: string;
    primaryText: string;
    border: string;
    inputText: string;
    placeholder: string;
    errorBg: string;
    errorText: string;
    errorBorder: string;
    successBg: string;
    successText: string;
    successBorder: string;
    infoBg: string;
    infoText: string;
    infoBorder: string;
    warningBg: string;
    warningText: string;
    warningBorder: string;
    focus: string;
    overlay: string;
  };
  spacing: {
    xxs: number;
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  radius: {
    card: number;
    control: number;
    pill: number;
  };
  font: {
    small: number;
    base: number;
    label: number;
    title: number;
    hero: number;
  };
  controlHeight: number;
  buttonHeight: number;
  maxContentWidth: number;
}

export const familyTheme: AppTheme = {
  mode: 'family',
  colors: {
    background: '#eef3fa',
    surface: '#ffffff',
    text: '#1b2430',
    muted: '#566274',
    primary: '#1f4e8c',
    primaryHover: '#163a69',
    primaryText: '#ffffff',
    border: '#b9c6d8',
    inputText: '#1b2430',
    placeholder: '#6b7789',
    errorBg: '#fdecec',
    errorText: '#8a1c1c',
    errorBorder: '#b23b3b',
    successBg: '#e9f7ef',
    successText: '#1e6b3a',
    successBorder: '#2f7d4c',
    infoBg: '#eaf2fd',
    infoText: '#1f4e8c',
    infoBorder: '#3b6ba5',
    warningBg: '#fff8e8',
    warningText: '#5c4308',
    warningBorder: '#a9832a',
    focus: '#b45309',
    overlay: 'rgba(10, 20, 32, 0.62)',
  },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 18, lg: 26, xl: 36 },
  radius: { card: 16, control: 12, pill: 999 },
  font: { small: 16, base: 18, label: 18, title: 26, hero: 32 },
  controlHeight: 52,
  buttonHeight: 56,
  maxContentWidth: 960,
};

export const seniorTheme: AppTheme = {
  mode: 'senior',
  colors: {
    background: '#f4f8ff',
    surface: '#ffffff',
    text: '#101820',
    muted: '#33414f',
    primary: '#0d3f7a',
    primaryHover: '#082b55',
    primaryText: '#ffffff',
    border: '#5b6b7d',
    inputText: '#101820',
    placeholder: '#4b5563',
    errorBg: '#fde8e8',
    errorText: '#7f1414',
    errorBorder: '#9b2c2c',
    successBg: '#e3f6e9',
    successText: '#135c2c',
    successBorder: '#1c6b38',
    infoBg: '#e6effc',
    infoText: '#0d3f7a',
    infoBorder: '#2f5f9e',
    warningBg: '#fff6dc',
    warningText: '#4a3600',
    warningBorder: '#8a6d1f',
    focus: '#b45309',
    overlay: 'rgba(10, 20, 32, 0.7)',
  },
  spacing: { xxs: 4, xs: 8, sm: 12, md: 18, lg: 26, xl: 36 },
  radius: { card: 16, control: 14, pill: 999 },
  font: { small: 20, base: 20, label: 20, title: 30, hero: 36 },
  controlHeight: 64,
  buttonHeight: 68,
  maxContentWidth: 720,
};

/** Sombra multiplataforma (en Android se traduce a `elevation`). */
export const cardShadow = {
  shadowColor: '#142a4a',
  shadowOpacity: 0.16,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 4,
} as const;
