const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const DISABLE_AUTH = process.env.DISABLE_AUTH === 'true';

/**
 * Usuario mock para pruebas sin autenticación.
 * Se usa solo cuando DISABLE_AUTH=true.
 */
function getMockUser() {
  return {
    _id: '000000000000000000000000',
    name: 'Usuario Demo',
    email: 'demo@local.test',
    role: 'familiar',
    emailVerified: true,
    emailVerifiedAt: new Date().toISOString(),
    tokenVersion: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    save: async () => {},
    select: () => {},
  };
}

module.exports = async function requireAuth(req, res, next) {
  // Modo prueba: inyecta usuario mock y continúa
  if (DISABLE_AUTH) {
    req.user = getMockUser();
    return next();
  }

  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub).select('+tokenVersion');

    if (!user) {
      return res.status(401).json({ error: 'La sesión ya no es válida.' });
    }

    const tokenVersion = Number(payload.tokenVersion || 0);
    const currentVersion = Number(user.tokenVersion || 0);

    if (tokenVersion !== currentVersion) {
      return res.status(401).json({
        error: 'La sesión ya no es válida.',
        code: 'SESSION_INVALIDATED',
      });
    }

    req.user = user;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
};
