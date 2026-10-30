const { getOlderAdultSession, consentState } = require('../services/olderAdultSession.service');
const DISABLE_AUTH = process.env.DISABLE_AUTH === 'true';

/**
 * Usuario mock de adulto mayor para pruebas sin autenticación.
 * Se usa solo cuando DISABLE_AUTH=true.
 */
function getMockOlderAdult() {
  return {
    _id: '111111111111111111111111',
    name: 'Adulto Mayor Demo',
    familiar: '000000000000000000000000',
    pinHash: '$2b$10$mockhash',
    birthDate: '1950-01-01',
    consentVersion: 1,
    consentAcceptedAt: new Date().toISOString(),
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function requireOlderAdultSession(req, res, next) {
  // Modo prueba: inyecta adulto mayor mock y continúa
  if (DISABLE_AUTH) {
    req.olderAdult = getMockOlderAdult();
    return next();
  }

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
  // Modo prueba: salta verificación de consentimiento
  if (DISABLE_AUTH) {
    return next();
  }

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
