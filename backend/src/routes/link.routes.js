const router = require('express').Router();
const { MESSAGES, redeemLinkingCode } = require('../services/olderAdult.service');
const { attemptKeyFor } = require('../services/linkAttempt.service');

router.post('/redeem', async (req, res, next) => {
  try {
    const result = await redeemLinkingCode({
      code: req.body?.code,
      consentAccepted: req.body?.consentAccepted === true,
      consentVersion: req.body?.consentVersion,
      attemptKey: attemptKeyFor(req),
    });

    switch (result.status) {
      case 'missing':
        return res.status(400).json({
          error: MESSAGES.linkCodeRequired,
          code: 'LINK_CODE_REQUIRED',
        });
      case 'invalid':
        return res.status(400).json({
          error: MESSAGES.linkCodeInvalid,
          code: 'LINK_CODE_INVALID',
          attemptsRemaining: result.attemptsRemaining,
        });
      case 'expired':
        return res.status(410).json({
          error: MESSAGES.linkCodeExpired,
          code: 'LINK_CODE_EXPIRED',
          attemptsRemaining: result.attemptsRemaining,
        });
      case 'used':
        return res.status(409).json({
          error: MESSAGES.linkCodeUsed,
          code: 'LINK_CODE_USED',
          attemptsRemaining: result.attemptsRemaining,
        });
      case 'consent_required':
        return res.status(400).json({
          error: 'Debes aceptar el consentimiento para vincular la app.',
          code: 'CONSENT_REQUIRED',
        });
      case 'consent_version_mismatch':
        return res.status(409).json({
          error: 'El texto del consentimiento cambió. Léelo de nuevo y acéptalo.',
          code: 'CONSENT_VERSION_OUTDATED',
        });
      case 'locked': {
        const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
        res.set('Retry-After', String(result.retryAfterSeconds));
        return res.status(429).json({
          error: `Demasiados intentos. Espera ${minutes} minutos y pide un código nuevo.`,
          code: 'LINK_ATTEMPTS_LOCKED',
          retryAfterSeconds: result.retryAfterSeconds,
        });
      }
      case 'linked':
        return res.json({
          message: MESSAGES.linkCodeRedeemed,
          sessionToken: result.sessionToken,
          consent: result.consent,
          olderAdult: result.olderAdult,
        });
      default:
        return next(new Error('Estado de vinculación no reconocido.'));
    }
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
