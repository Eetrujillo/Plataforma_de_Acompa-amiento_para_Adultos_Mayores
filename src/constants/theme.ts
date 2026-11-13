/**
 * Design tokens for the "Acompañamiento de Adulto Mayor" app.
 * Visual direction: colorful / energetic — saturated, contrasted color blocks
 * per landing section (see S6).
 */

import '@/global.css';

export const Palette = {
  // Brand blocks
  violet: '#6D28D9',
  violetDark: '#4C1D95',
  orange: '#F97316',
  orangeDark: '#C2410C',
  pink: '#EC4899',
  pinkDark: '#BE185D',
  teal: '#0D9488',
  sky: '#0284C7',
  yellow: '#FBBF24',

  // Neutrals
  ink: '#1E1B4B',
  inkSoft: '#4B4767',
  surface: '#FFFFFF',
  surfaceAlt: '#FDF4FF',
  textOnBlock: '#FFFFFF',

  // Feedback
  danger: '#DC2626',
  success: '#16A34A',
} as const;

export type PaletteColor = keyof typeof Palette;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 72,
} as const;

export const Radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/** Maximum width of the reading column on the technical web landing. */
export const MaxContentWidth = 1040;
