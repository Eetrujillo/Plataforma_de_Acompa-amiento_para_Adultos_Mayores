const router = require('express').Router();
const { CONSENT_TEXT, CONSENT_VERSION } = require('../constants/consent');
const {
  requireCurrentConsent,
  requireOlderAdultSession,
} = require('../middleware/olderAdultAuth');
const {
  appPublicOlderAdult,
} = require('../services/olderAdult.service');
const {
  acceptOlderAdultConsent,
  consentState,
  logoutOlderAdultWithPin,
} = require('../services/olderAdultSession.service');
const {
  completeOccurrence,
  listOccurrencesForDate,
  undoOccurrence,
} = require('../services/activity.service');

router.get('/consent', (req, res) => {
  return res.json({ consent: CONSENT_TEXT });
});

router.get('/session', requireOlderAdultSession, (req, res) => {
  return res.json({
    olderAdult: appPublicOlderAdult(req.olderAdult),
    consent: consentState(req.olderAdult),
  });
});

router.post('/consent', requireOlderAdultSession, async (req, res, next) => {
  try {
    const result = await acceptOlderAdultConsent({
      olderAdult: req.olderAdult,
      consentVersion: req.body?.consentVersion,
      accepted: req.body?.accepted === true,
    });

    if (result.status === 'rejected') {
      return res.status(400).json({
        error: 'No se compartirá nada. La app no quedará vinculada.',
        code: 'CONSENT_REJECTED',
      });
    }

    if (result.status === 'version_mismatch') {
      return res.status(409).json({
        error: 'El texto del consentimiento cambió. Léelo de nuevo y acéptalo para continuar.',
        code: 'CONSENT_VERSION_OUTDATED',
      });
    }

    return res.json({
      message: 'Consentimiento aceptado.',
      consent: {
        version: CONSENT_VERSION,
        acceptedAt: result.consent.acceptedAt,
      },
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', requireOlderAdultSession, async (req, res, next) => {
  try {
    const result = await logoutOlderAdultWithPin({
      olderAdult: req.olderAdult,
      pin: req.body?.pin,
    });

    if (result.status === 'locked') {
      res.set('Retry-After', String(result.retryAfterSeconds));
      return res.status(429).json({
        error: `PIN incorrecto. Espera ${Math.ceil(result.retryAfterSeconds / 60)} minutos para intentar de nuevo.`,
        code: 'PIN_ATTEMPTS_LOCKED',
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    if (result.status === 'invalid_pin') {
      return res.status(401).json({
        error: 'PIN incorrecto.',
        code: 'PIN_INVALID',
        attemptsRemaining: result.attemptsRemaining,
      });
    }

    return res.json({
      message: 'Sesión cerrada.',
      code: 'OLDER_ADULT_LOGGED_OUT',
    });
  } catch (err) {
    return next(err);
  }
});

router.get(
  '/activities',
  requireOlderAdultSession,
  requireCurrentConsent,
  async (req, res, next) => {
    try {
      const result = await listOccurrencesForDate({
        olderAdult: req.olderAdult,
        dateKey: req.query?.date,
      });

      return res.json({
        olderAdult: appPublicOlderAdult(req.olderAdult),
        ...result,
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.post(
  '/activities/:id/complete',
  requireOlderAdultSession,
  requireCurrentConsent,
  async (req, res, next) => {
    try {
      const result = await completeOccurrence({
        olderAdult: req.olderAdult,
        activityId: req.params.id,
        dateKey: req.body?.date,
        // HU-019: hora real del toque, enviada desde el celular.
        completedAt: req.body?.completedAt,
      });

      if (result.status === 'invalid_completed_at') {
        return res.status(400).json({
          error: 'La hora de la marca no es válida.',
          code: 'ACTIVITY_COMPLETED_AT_INVALID',
        });
      }

      if (result.status === 'not_found') {
        return res.status(404).json({
          error: 'Actividad no encontrada.',
          code: 'ACTIVITY_NOT_FOUND',
        });
      }

      if (result.status === 'not_occurred') {
        return res.status(400).json({
          error: 'La actividad no corresponde a la fecha indicada.',
          code: 'ACTIVITY_NOT_OCCURRED',
        });
      }

      return res.json({
        message: 'Actividad marcada como hecha.',
        completion: result.completion,
      });
    } catch (err) {
      return next(err);
    }
  }
);

router.delete(
  '/activities/:id/complete',
  requireOlderAdultSession,
  requireCurrentConsent,
  async (req, res, next) => {
    try {
      const result = await undoOccurrence({
        olderAdult: req.olderAdult,
        activityId: req.params.id,
        dateKey: req.query?.date,
      });

      if (result.status === 'invalid_date') {
        return res.status(400).json({
          error: 'La fecha no es válida.',
          code: 'ACTIVITY_DATE_INVALID',
        });
      }

      return res.json({
        message: 'Marca de actividad retirada.',
        code: 'ACTIVITY_COMPLETION_UNDONE',
      });
    } catch (err) {
      return next(err);
    }
  }
);

module.exports = router;
