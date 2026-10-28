export function formatWait(seconds: number): string {
  if (seconds <= 0) return '0 segundos';
  if (seconds < 60) {
    return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
}
