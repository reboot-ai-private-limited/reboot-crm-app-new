// Light theme only. Values mirror the "Colors" variables in the Figma file.
export const colors = {
  bg: '#F6F8FC',
  surface: '#FFFFFF',
  border: '#E5EAF2',
  text: '#0F172A',
  textMuted: '#64748B',
  textSubtle: '#94A3B8',
  primary: '#2F80FF',
  primaryDark: '#0062FF',
  primarySoft: '#EAF2FF',
  success: '#16A34A',
  successSoft: '#E8F7EE',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
  purple: '#7C3AED',
  purpleSoft: '#F1EAFE',
  slate: '#475569',
  slateSoft: '#EEF2F6',
} as const;

export type ColorName = keyof typeof colors;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const radius = { sm: 10, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const gradient = ['#4F9BFF', '#0062FF'] as const;

export const font = {
  regular: undefined,
} as const;
