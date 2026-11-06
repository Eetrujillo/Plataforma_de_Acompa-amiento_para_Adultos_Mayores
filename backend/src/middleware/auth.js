const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

module.exports = async function requireAuth(req, res, next) {
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
