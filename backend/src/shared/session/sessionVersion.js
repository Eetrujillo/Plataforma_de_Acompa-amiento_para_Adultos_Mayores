'use strict';

/**
 * Versión de sesión del usuario.
 *
 * Un JWT no se puede retirar una vez emitido: el servidor no guarda nada de él. Para
 * poder invalidar las sesiones abiertas (por ejemplo después de cambiar la contraseña)
 * el token lleva la versión que tenía el usuario al emitirse, y el middleware la compara
 * contra la guardada. Subir la versión equivale a "cerrar todas las sesiones".
 *
 * El campo es nullable porque los documentos que ya existen no lo tienen; `null` se lee
 * como 0, así que un token emitido antes de este cambio sigue sirviendo hasta que la
 * versión suba por primera vez. Nadie queda afuera por un despliegue.
 */
const SESSION_VERSION_CLAIM = 'sv';

function sessionVersionOf(user) {
  const version = user?.sessionVersion;
  return Number.isInteger(version) && version > 0 ? version : 0;
}

function tokenVersionOf(claims) {
  const version = claims?.[SESSION_VERSION_CLAIM];
  return Number.isInteger(version) && version > 0 ? version : 0;
}

/**
 * Payload del token de sesión. Los cuatro lugares que firman un JWT (login, verificación
 * de correo, login con Google y vinculación de adulto mayor) lo usan para no olvidarse
 * del claim: un token sin `sv` se leería como versión 0 y quedaría inválido en cuanto el
 * usuario cambie su contraseña.
 */
function sessionClaims(user) {
  return {
    sub: user.id,
    role: user.role,
    email: user.email,
    [SESSION_VERSION_CLAIM]: sessionVersionOf(user)
  };
}

module.exports = {
  SESSION_VERSION_CLAIM,
  sessionVersionOf,
  tokenVersionOf,
  sessionClaims
};
