/** Texto de espera para bloqueos por intentos fallidos o reenvíos. */
export function formatWait(seconds: number): string {
  if (seconds <= 0) return '0 segundos';
  if (seconds < 60) {
    return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
}

/** "Hace 3 s" para el indicador de última actualización. */
export function formatClockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}
