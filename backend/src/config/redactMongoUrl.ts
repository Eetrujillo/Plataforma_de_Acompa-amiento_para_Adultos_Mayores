/**
 * Redacta el userinfo de una URL de conexión para poder loguearla. Conserva
 * esquema, host, puerto, base y query; nunca imprime usuario ni contraseña.
 *
 * El log de arranque imprime la URL de Mongo para diagnosticar a qué base se
 * conectó, y esa URL puede llevar credenciales reales.
 */
export function redactMongoUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.username === '' && url.password === '') return raw;
    url.username = '***';
    url.password = '';
    return url.toString();
  } catch {
    // URL que `URL` no puede parsear: se redacta el userinfo por texto.
    return redactConnectionStrings(raw);
  }
}

/**
 * Redacta el userinfo de cualquier URI de conexión embebida en un texto libre.
 *
 * Los errores del driver de Mongo repiten la URI que falló, credenciales
 * incluidas (`MongoParseError: ... in "mongodb://user:secret@/db"`), y ese
 * mensaje es justamente el que se loguea cuando el backend no arranca.
 *
 * El userinfo se toma hasta el último `@` que no esté seguido de `/`: así una
 * contraseña con `@` sin escapar tampoco se filtra.
 */
export function redactConnectionStrings(text: string): string {
  return text.replace(/\/\/[^/\s]*@/g, '//***@');
}
