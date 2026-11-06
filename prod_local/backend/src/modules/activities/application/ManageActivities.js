'use strict';

const { ForbiddenError, NotFoundError } = require('../../../shared/errors');
const { combineDateAndTime } = require('../../../shared/utils/dateTime');
const {
  toPublicActivity,
  validateActivityInput,
  timeZoneOf
} = require('../domain/activityRules');

/**
 * HU-012 a HU-015 y HU-020: gestión de actividades por parte del familiar.
 *
 * Ports: activityRepository, olderAdultRepository, dayBuilder
 */
class ManageActivities {
  constructor({ activityRepository, olderAdultRepository, dayBuilder, now = () => new Date() }) {
    this.activityRepository = activityRepository;
    this.olderAdultRepository = olderAdultRepository;
    this.dayBuilder = dayBuilder;
    this.now = now;
  }

  async requireOwnedProfile({ caregiverId, olderAdultId }) {
    const profile = await this.olderAdultRepository.findOwned({
      id: olderAdultId,
      caregiverId
    });

    if (!profile) throw new NotFoundError('Perfil no encontrado.');

    return profile;
  }

  async requireOwnedActivity({ caregiverId, id }) {
    const activity = await this.activityRepository.findActiveById(id);

    // Se responde 404 tanto si no existe como si es de otro familiar: no se
    // revela la existencia de actividades ajenas.
    if (!activity || activity.createdBy !== caregiverId) {
      throw new NotFoundError('Actividad no encontrada.');
    }

    return activity;
  }

  async list({ caregiverId, olderAdultId }) {
    if (olderAdultId) {
      await this.requireOwnedProfile({ caregiverId, olderAdultId });
    }

    const activities = await this.activityRepository.listByCaregiver({
      caregiverId,
      seniorId: olderAdultId || null
    });

    return { activities: activities.map(toPublicActivity) };
  }

  async create({
    caregiverId,
    olderAdultId,
    title,
    icon,
    date,
    time,
    repeatType,
    weekdays,
    confirmPast
  }) {
    const profile = await this.requireOwnedProfile({ caregiverId, olderAdultId });
    const values = validateActivityInput({
      title,
      icon,
      date,
      time,
      repeatType,
      weekdays,
      confirmPast,
      timeZone: timeZoneOf(profile),
      now: this.now()
    });

    const created = await this.activityRepository.create({
      seniorId: profile.id,
      createdBy: caregiverId,
      title: values.title,
      description: null,
      scheduledDate: values.date,
      scheduledTime: values.time,
      status: 'PENDING',
      icon: values.icon,
      timeZone: values.timeZone,
      repeatType: values.repeatType,
      weekdays: values.weekdays,
      active: true
    });

    return { activity: toPublicActivity(created) };
  }

  async update({
    caregiverId,
    id,
    title,
    icon,
    date,
    time,
    repeatType,
    weekdays,
    confirmPast
  }) {
    const activity = await this.requireOwnedActivity({ caregiverId, id });
    const profile = await this.requireOwnedProfile({
      caregiverId,
      olderAdultId: activity.seniorId
    });

    const zone = timeZoneOf(profile);
    const previousScheduledAt = combineDateAndTime(
      activity.scheduledDate,
      activity.scheduledTime,
      zone
    );

    const values = validateActivityInput({
      title,
      icon,
      date,
      time,
      repeatType,
      weekdays,
      confirmPast,
      timeZone: zone,
      now: this.now(),
      previousScheduledAt
    });

    const updated = await this.activityRepository.update(activity.id, {
      title: values.title,
      scheduledDate: values.date,
      scheduledTime: values.time,
      icon: values.icon,
      timeZone: values.timeZone,
      repeatType: values.repeatType,
      weekdays: values.weekdays
    });

    return { activity: toPublicActivity(updated) };
  }

  async remove({ caregiverId, id }) {
    const activity = await this.requireOwnedActivity({ caregiverId, id });
    const deleted = await this.activityRepository.softDelete(activity.id, this.now());

    return {
      activity: toPublicActivity(deleted),
      message:
        'Actividad eliminada. Dejará de aparecer y de generar recordatorios desde hoy; el historial anterior se conserva.'
    };
  }

  /** HU-020: estado de hoy para el familiar. */
  async today({ caregiverId, olderAdultId, date }) {
    if (!olderAdultId) {
      throw new NotFoundError('Perfil no encontrado.');
    }

    const profile = await this.requireOwnedProfile({ caregiverId, olderAdultId });
    const dateKey = this.dayBuilder.resolveDate(date, profile);

    return this.dayBuilder.buildDay({ profile, dateKey });
  }
}

module.exports = { ManageActivities };
