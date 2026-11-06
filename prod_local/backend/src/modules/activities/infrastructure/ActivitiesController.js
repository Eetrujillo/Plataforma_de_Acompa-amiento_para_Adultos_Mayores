'use strict';

const { asyncHandler } = require('../../../shared/middlewares/asyncHandler');
const { ValidationError } = require('../../../shared/errors');

/**
 * Controlador de actividades.
 *
 * Convive con las rutas que ya existían en `prod` (`POST /` con `seniorId`,
 * `GET /daily`) y añade las de la versión anterior (CRUD por `olderAdultId` y
 * `GET /today`). El cliente no necesita cambiar de URL.
 */
function createActivitiesController({
  createActivity,
  getDailyRoutine,
  markCompleted,
  manageActivities
}) {
  return {
    create: asyncHandler(async (req, res) => {
      // Formulario nuevo (HU-012): `olderAdultId` + `date`/`time`.
      if (req.body?.olderAdultId) {
        res.status(201).json(
          await manageActivities.create({
            caregiverId: req.user.id,
            olderAdultId: req.body.olderAdultId,
            title: req.body.title,
            icon: req.body.icon,
            date: req.body.date,
            time: req.body.time,
            repeatType: req.body.repeatType,
            weekdays: req.body.weekdays,
            confirmPast: req.body.confirmPast
          })
        );
        return;
      }

      // Forma anterior de `prod` (compatibilidad hacia atrás).
      if (req.body?.seniorId) {
        const activity = await createActivity.execute({
          caregiverId: req.user.id,
          seniorId: req.body.seniorId,
          title: req.body.title,
          description: req.body.description,
          scheduledTime: req.body.scheduledTime,
          scheduledDate: req.body.scheduledDate
        });

        res.status(201).json({ activity });
        return;
      }

      throw new ValidationError('Selecciona a tu adulto mayor.', { field: 'olderAdultId' });
    }),

    list: asyncHandler(async (req, res) => {
      res.status(200).json(
        await manageActivities.list({
          caregiverId: req.user.id,
          olderAdultId: req.query.olderAdultId
        })
      );
    }),

    today: asyncHandler(async (req, res) => {
      res.status(200).json(
        await manageActivities.today({
          caregiverId: req.user.id,
          olderAdultId: req.query.olderAdultId,
          date: req.query.date
        })
      );
    }),

    update: asyncHandler(async (req, res) => {
      res.status(200).json(
        await manageActivities.update({
          caregiverId: req.user.id,
          id: req.params.id,
          title: req.body?.title,
          icon: req.body?.icon,
          date: req.body?.date,
          time: req.body?.time,
          repeatType: req.body?.repeatType,
          weekdays: req.body?.weekdays,
          confirmPast: req.body?.confirmPast
        })
      );
    }),

    remove: asyncHandler(async (req, res) => {
      res.status(200).json(
        await manageActivities.remove({ caregiverId: req.user.id, id: req.params.id })
      );
    }),

    daily: asyncHandler(async (req, res) => {
      const routine = await getDailyRoutine.execute({
        seniorId: req.query.seniorId || req.user.id,
        date: req.query.date,
        requester: req.user
      });

      res.status(200).json(routine);
    }),

    complete: asyncHandler(async (req, res) => {
      const activity = await markCompleted.execute({
        activityId: req.params.id,
        seniorId: req.user.id
      });

      res.status(200).json({ activity });
    })
  };
}

module.exports = { createActivitiesController };
