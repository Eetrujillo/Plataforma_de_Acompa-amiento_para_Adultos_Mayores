const { getOlderAdultSession, consentState } = require('../services/olderAdultSession.service');

async function requireOlderAdultSession(req, res, next) {
  try {
    const token = req.get('x-older-adult-token');
    const result = await getOlderAdultSession({ token });

    if (result.status === 'active') {
      req.olderAdult = result.olderAdult;
      return next();
    }

    if (result.status === 'missing') {
      return res.status(401).json({
        error: 'No hay una sesión de la app vinculada.',
        code: 'OLDER_ADULT_SESSION_REQUIRED',
      });
    }

    return res.status(401).json({
      error: 'Tu vinculación ya no está activa. Pide a tu familiar un código nuevo.',
      code: 'OLDER_ADULT_SESSION_INVALID',
    });
  } catch (err) {
    return next(err);
  }
}

function requireCurrentConsent(req, res, next) {
  const state = consentState(req.olderAdult);

  if (state.required) {
    return res.status(403).json({
      error: 'Necesitamos que vuelvas a aceptar el consentimiento para seguir.',
      code: 'CONSENT_VERSION_OUTDATED',
      consent: state,
    });
  }

  return next();
}

module.exports = {
  requireCurrentConsent,
  requireOlderAdultSession,
};
