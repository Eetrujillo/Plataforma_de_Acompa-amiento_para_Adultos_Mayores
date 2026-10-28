const router = require('express').Router();
const {
  createOlderAdult,
  generateLinkingCode,
  getOlderAdult,
  listOlderAdults,
  MESSAGES,
  unlinkOlderAdult,
  updateOlderAdult,
} = require('../services/olderAdult.service');

function sendValidationError(res, result) {
  return res.status(400).json({
    error: result.message,
    code: result.code,
    field: result.field,
  });
}

function sendNotFound(res) {
  return res.status(404).json({
    error: 'Perfil no encontrado.',
    code: 'OLDER_ADULT_NOT_FOUND',
  });
}

router.get('/', async (req, res, next) => {
  try {
    const olderAdults = await listOlderAdults(req.user._id);
    return res.json({ olderAdults });
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const result = await createOlderAdult({
      familiarId: req.user._id,
      name: req.body?.name,
      pin: req.body?.pin,
      timeZone: req.body?.timeZone,
    });

    if (result.status === 'invalid') {
      return sendValidationError(res, result);
    }

    return res.status(201).json({
      message: 'Perfil creado. Queda pendiente de vincular.',
      olderAdult: result.olderAdult,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/linking-code', async (req, res, next) => {
  try {
    const result = await generateLinkingCode({
      familiarId: req.user._id,
      id: req.params.id,
    });

    if (result.status === 'not_found') {
      return sendNotFound(res);
    }

    if (result.status === 'already_linked') {
      return res.status(409).json({
        error: MESSAGES.olderAdultAlreadyLinked,
        code: 'OLDER_ADULT_ALREADY_LINKED',
      });
    }

    return res.status(201).json({
      message: MESSAGES.linkCodeGenerated,
      linkingCode: result.linkingCode,
      olderAdult: result.olderAdult,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/unlink', async (req, res, next) => {
  try {
    const result = await unlinkOlderAdult({
      familiarId: req.user._id,
      id: req.params.id,
    });

    if (result.status === 'not_found') {
      return sendNotFound(res);
    }

    if (result.status === 'not_linked') {
      return res.status(409).json({
        error: 'Este adulto mayor no está vinculado.',
        code: 'OLDER_ADULT_NOT_LINKED',
      });
    }

    return res.json({
      message:
        'Adulto mayor desvinculado. Su app dejará de mostrar actividades y alertas.',
      olderAdult: result.olderAdult,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const olderAdult = await getOlderAdult({
      familiarId: req.user._id,
      id: req.params.id,
    });

    if (!olderAdult) {
      return sendNotFound(res);
    }

    return res.json({ olderAdult });
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const result = await updateOlderAdult({
      familiarId: req.user._id,
      id: req.params.id,
      name: req.body?.name,
      pin: req.body?.pin,
      timeZone: req.body?.timeZone,
    });

    if (result.status === 'invalid') {
      return sendValidationError(res, result);
    }

    if (result.status === 'not_found') {
      return sendNotFound(res);
    }

    return res.json({
      message: 'Perfil actualizado.',
      olderAdult: result.olderAdult,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
