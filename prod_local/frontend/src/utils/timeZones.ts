export const DEFAULT_TIME_ZONE = 'America/Bogota';

export interface TimeZoneOption {
  value: string;
  label: string;
}

export const TIME_ZONE_OPTIONS: TimeZoneOption[] = [
  { value: 'America/Bogota', label: 'America/Bogota (Colombia)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City (México)' },
  { value: 'America/Lima', label: 'America/Lima (Perú)' },
  { value: 'America/Santiago', label: 'America/Santiago (Chile)' },
  {
    value: 'America/Argentina/Buenos_Aires',
    label: 'America/Argentina/Buenos_Aires (Argentina)',
  },
  { value: 'America/Caracas', label: 'America/Caracas (Venezuela)' },
  { value: 'America/Panama', label: 'America/Panama (Panamá)' },
  { value: 'America/Guayaquil', label: 'America/Guayaquil (Ecuador)' },
  { value: 'America/La_Paz', label: 'America/La_Paz (Bolivia)' },
  { value: 'America/Montevideo', label: 'America/Montevideo (Uruguay)' },
  { value: 'America/Asuncion', label: 'America/Asuncion (Paraguay)' },
  { value: 'America/Costa_Rica', label: 'America/Costa_Rica (Costa Rica)' },
  { value: 'America/El_Salvador', label: 'America/El_Salvador (El Salvador)' },
  { value: 'America/Guatemala', label: 'America/Guatemala (Guatemala)' },
  { value: 'America/Tegucigalpa', label: 'America/Tegucigalpa (Honduras)' },
  { value: 'America/Managua', label: 'America/Managua (Nicaragua)' },
  {
    value: 'America/Santo_Domingo',
    label: 'America/Santo_Domingo (República Dominicana)',
  },
  { value: 'America/Puerto_Rico', label: 'America/Puerto_Rico (Puerto Rico)' },
  { value: 'America/Havana', label: 'America/Havana (Cuba)' },
  { value: 'America/New_York', label: 'America/New_York (Estados Unidos)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (Estados Unidos)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (España)' },
  { value: 'UTC', label: 'UTC' },
];

export function getTimeZoneOptions(current?: string): TimeZoneOption[] {
  if (current && !TIME_ZONE_OPTIONS.some((option) => option.value === current)) {
    return [{ value: current, label: current }, ...TIME_ZONE_OPTIONS];
  }

  return TIME_ZONE_OPTIONS;
}

export function getTimeZoneLabel(value: string): string {
  return TIME_ZONE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
