const router = require('express').Router();
const {
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  listDayForFamily,
  MESSAGES,
  updateActivity,
} = require('../services/activity.service');

function sendValidationError(res, result) {
  return res.status(400).json({
    error: result.message,
    code: result.code,
    field: result.field,
  });
}

function sendPastConfirmation(res, result) {
  return res.status(409).json({
    error: result.message,
    code: result.code,
    field: result.field,
    requiresConfirmation: true,
  });
}

function sendNotFound(res) {
  return res.status(404).json({
    error: MESSAGES.activityNotFound,
    code: 'ACTIVITY_NOT_FOUND',
  });
}

function sendOlderAdultNotFound(res) {
  return res.status(404).json({
    error: MESSAGES.olderAdultNotFound,
    code: 'OLDER_ADULT_NOT_FOUND',
  });
}

router.get('/', async (req, res, next) => {
  try {
    const activities = await listActivities({
      familiarId: req.user._id,
      olderAdultId: req.query?.olderAdultId,
    });
    return res.json({ activities });
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const result = await createActivity({
      familiarId: req.user._id,
      olderAdultId: req.body?.olderAdultId,
      title: req.body?.title,
      icon: req.body?.icon,
      date: req.body?.date,
      time: req.body?.time,
      repeatType: req.body?.repeatType,
      weekdays: req.body?.weekdays,
      confirmPast: req.body?.confirmPast === true,
    });

    if (result.status === 'not_found') return sendOlderAdultNotFound(res);
    if (result.status === 'invalid') return sendValidationError(res, result);
    if (result.status === 'past_requires_confirmation') {
      return sendPastConfirmation(res, result);
    }

    return res.status(201).json({
      message: 'Actividad creada.',
      activity: result.activity,
    });
  } catch (err) {
    return next(err);
  }
});

// HU-020: estado del dia del adulto mayor, para el familiar.
// Va antes de `/:id` para que "today" no se interprete como un id.
router.get('/today', async (req, res, next) => {
  try {
    const result = await listDayForFamily({
      familiarId: req.user._id,
      olderAdultId: req.query?.olderAdultId,
      dateKey: req.query?.date,
    });

    if (result.status === 'older_adult_required') {
      return res.status(400).json({
        error: 'Selecciona a tu adulto mayor.',
        code: 'OLDER_ADULT_REQUIRED',
      });
    }

    if (result.status === 'invalid_date') {
      return res.status(400).json({
        error: 'La fecha no es válida.',
        code: 'ACTIVITY_DATE_INVALID',
      });
    }

    if (result.status === 'not_found') return sendOlderAdultNotFound(res);

    return res.json(result.day);
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const activity = await getActivity({
      familiarId: req.user._id,
      id: req.params.id,
    });

    if (!activity) return sendNotFound(res);

    return res.json({ activity });
  } catch (err) {
    return next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const result = await updateActivity({
      familiarId: req.user._id,
      id: req.params.id,
      title: req.body?.title,
      icon: req.body?.icon,
      date: req.body?.date,
      time: req.body?.time,
      repeatType: req.body?.repeatType,
      weekdays: req.body?.weekdays,
      confirmPast: req.body?.confirmPast === true,
    });

    if (result.status === 'not_found') return sendNotFound(res);
    if (result.status === 'invalid') return sendValidationError(res, result);
    if (result.status === 'past_requires_confirmation') {
      return sendPastConfirmation(res, result);
    }

    return res.json({
      message: 'Actividad actualizada.',
      activity: result.activity,
    });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await deleteActivity({
      familiarId: req.user._id,
      id: req.params.id,
    });

    if (result.status === 'not_found') return sendNotFound(res);

    return res.json({
      message: 'Actividad eliminada. Dejará de aparecer desde hoy.',
      activity: result.activity,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
