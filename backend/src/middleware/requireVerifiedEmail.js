/**
 * Debe usarse después de `requireAuth`.
 * Bloquea las funciones protegidas mientras el correo no esté confirmado.
 * No se aplica a /api/auth/me para que el frontend pueda conocer el estado.
 */
module.exports = function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'No autorizado.',
      code: 'UNAUTHORIZED',
    });
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({
      error: 'Confirma tu correo electrónico para acceder a esta función.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  return next();
};
