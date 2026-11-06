'use strict';

const {
  AppError,
  ForbiddenError,
  NotFoundError,
  ValidationError
} = require('../../../shared/errors');
const { CONSENT_TEXT, CONSENT_VERSION } = require('../../../shared/consent');
const { getDateKey, formatRepeatSummary, parseDateKey } = require('../../../shared/utils/dateTime');
const {
  activityOccursOnDate,
  dayStatus,
  occurrenceInstant,
  resolveCompletionInstant,
  toDayItem
} = require('../../activities/domain/activityRules');
const { DEFAULT_TIME_ZONE, toAppProfile } = require('../../older_adults/domain/olderAdult');

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 5;

/**
 * Casos de uso de la app del adulto mayor (HU-008, HU-009, HU-011 y HU-017 a
 * HU-019). Se agrupan porque comparten el perfil y el token del mismo actor.
 *
 * Ports: olderAdultRepository, activityRepository, passwordHasher
 */
class SeniorAppService {
  constructor({ olderAdultRepository, activityRepository, passwordHasher, now = () => new Date() }) {
    this.olderAdultRepository = olderAdultRepository;
    this.activityRepository = activityRepository;
    this.passwordHasher = passwordHasher;
    this.now = now;
  }

  timeZoneOf(profile) {
    return profile?.timeZone || DEFAULT_TIME_ZONE;
  }

  consentState(profile) {
    const acceptedVersion = profile?.consentVersion ?? null;

    return {
      currentVersion: CONSENT_VERSION,
      acceptedVersion,
      required: acceptedVersion !== CONSENT_VERSION
    };
  }

  async requireProfile(seniorId) {
    const profile = await this.olderAdultRepository.findById(seniorId);

    if (!profile) {
      throw new AppError('Tu vinculación ya no está activa. Pide a tu familiar un código nuevo.', {
        statusCode: 401,
        code: 'OLDER_ADULT_SESSION_INVALID'
      });
    }

    return profile;
  }

  async getConsent() {
    return { consent: CONSENT_TEXT };
  }

  async getSession({ seniorId }) {
    const profile = await this.requireProfile(seniorId);

    return {
      olderAdult: toAppProfile(profile),
      consent: this.consentState(profile)
    };
  }

  async acceptConsent({ seniorId, consentVersion, accepted }) {
    if (accepted !== true) {
      throw new AppError('Debes aceptar el consentimiento para continuar.', {
        statusCode: 400,
        code: 'CONSENT_REQUIRED'
      });
    }

    if (consentVersion !== CONSENT_VERSION) {
      throw new AppError('Necesitamos que vuelvas a aceptar el consentimiento para seguir.', {
        statusCode: 403,
        code: 'CONSENT_VERSION_OUTDATED',
        details: {
          consent: {
            currentVersion: CONSENT_VERSION,
            acceptedVersion: consentVersion ?? null,
            required: true
          }
        }
      });
    }

    const profile = await this.requireProfile(seniorId);
    const acceptedAt = this.now();

    await this.olderAdultRepository.update(profile.id, {
      consentVersion: CONSENT_VERSION,
      consentAcceptedAt: acceptedAt
    });

    return {
      message: 'Consentimiento aceptado. Ya puedes seguir usando la app.',
      consent: { version: CONSENT_VERSION, acceptedAt }
    };
  }

  /**
   * HU-017: la fecha la envía el celular. Sin fecha se usa el día del perfil,
   * que es la misma zona horaria que configuró el familiar.
   */
  resolveDate(date, profile) {
    if (date === undefined || date === null || String(date).trim() === '') {
      return getDateKey(this.now(), this.timeZoneOf(profile));
    }

    if (!parseDateKey(String(date))) {
      throw new ValidationError('La fecha no es válida.', { field: 'date' });
    }

    return String(date);
  }

  async buildDay({ profile, dateKey }) {
    const activities = await this.activityRepository.listBySenior(profile.id);
    const completions = await this.activityRepository.listCompletions({
      seniorId: profile.id,
      occurrenceDate: dateKey
    });
    const completionByActivity = new Map(
      completions.map((completion) => [completion.activityId, completion])
    );

    const now = this.now();
    const items = activities
      .filter((activity) => activityOccursOnDate(activity, dateKey))
      .map((activity) => {
        const completion = completionByActivity.get(activity.id);
        const item = toDayItem(activity, dateKey, completion);

        return {
          ...item,
          status: dayStatus({ completed: item.completed, expiresAt: item.expiresAt, now })
        };
      })
      .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());

    return {
      date: dateKey,
      timeZone: this.timeZoneOf(profile),
      olderAdult: {
        _id: profile.id,
        name: profile.fullName,
        timeZone: this.timeZoneOf(profile)
      },
      activities: items
    };
  }

  async listDay({ seniorId, date }) {
    const profile = await this.requireProfile(seniorId);
    const dateKey = this.resolveDate(date, profile);

    return this.buildDay({ profile, dateKey });
  }

  async complete({ seniorId, activityId, date, completedAt }) {
    const profile = await this.requireProfile(seniorId);
    const activity = await this.activityRepository.findActiveById(activityId);

    if (!activity || activity.seniorId !== profile.id) {
      throw new NotFoundError('Actividad no encontrada.');
    }

    const dateKey = this.resolveDate(date, profile);

    if (!activityOccursOnDate(activity, dateKey)) {
      throw new AppError('La actividad no corresponde a la fecha indicada.', {
        statusCode: 400,
        code: 'ACTIVITY_NOT_OCCURRED'
      });
    }

    // HU-019: se guarda la hora del toque en el celular, no la de llegada.
    const instant = resolveCompletionInstant(completedAt, this.now());
    const occurrence = occurrenceInstant(activity, dateKey);

    const completion = await this.activityRepository.upsertCompletion({
      activityId: activity.id,
      seniorId: profile.id,
      occurrenceDate: dateKey,
      completedAt: instant
    });

    return {
      message: 'Actividad marcada como hecha.',
      completion: {
        _id: completion.id,
        activity: activity.id,
        occurrenceDate: dateKey,
        completedAt: completion.completedAt,
        snapshot: {
          title: activity.title,
          icon: activity.icon ?? 'otro',
          time: activity.scheduledTime,
          timeZone: this.timeZoneOf(profile),
          repeatSummary: formatRepeatSummary(
            activity.repeatType ?? 'once',
            activity.weekdays ?? []
          ),
          scheduledAt: occurrence
        }
      }
    };
  }

  async undo({ seniorId, activityId, date }) {
    const profile = await this.requireProfile(seniorId);
    const activity = await this.activityRepository.findActiveById(activityId);

    if (!activity || activity.seniorId !== profile.id) {
      throw new NotFoundError('Actividad no encontrada.');
    }

    if (!parseDateKey(String(date ?? ''))) {
      throw new ValidationError('La fecha no es válida.', { field: 'date' });
    }

    await this.activityRepository.deleteCompletion({
      activityId: activity.id,
      occurrenceDate: String(date)
    });

    return { message: 'Marca deshecha.' };
  }

  /**
   * HU-011: cerrar sesión exige el PIN de 4 números. El bloqueo es por perfil,
   * como en la versión anterior.
   */
  async logout({ seniorId, pin }) {
    const profile = await this.requireProfile(seniorId);
    const now = this.now();

    if (profile.pinLockedUntil && new Date(profile.pinLockedUntil).getTime() > now.getTime()) {
      const retryAfterSeconds = Math.ceil(
        (new Date(profile.pinLockedUntil).getTime() - now.getTime()) / 1000
      );

      throw new AppError('Demasiados intentos con el PIN. Espera unos minutos.', {
        statusCode: 429,
        code: 'PIN_ATTEMPTS_LOCKED',
        details: { retryAfterSeconds }
      });
    }

    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      throw new ValidationError('Escribe tu PIN de 4 números.', { field: 'pin' });
    }

    const matches = profile.pinHash
      ? await this.passwordHasher.compare(pin, profile.pinHash)
      : false;

    if (!matches) {
      const attempts = Number(profile.failedPinAttempts ?? 0) + 1;
      const shouldLock = attempts >= PIN_MAX_ATTEMPTS;

      await this.olderAdultRepository.update(profile.id, {
        failedPinAttempts: shouldLock ? 0 : attempts,
        pinLockedUntil: shouldLock
          ? new Date(now.getTime() + PIN_LOCK_MINUTES * 60_000)
          : profile.pinLockedUntil ?? null
      });

      if (shouldLock) {
        throw new AppError('Demasiados intentos con el PIN. Espera unos minutos.', {
          statusCode: 429,
          code: 'PIN_ATTEMPTS_LOCKED',
          details: { retryAfterSeconds: PIN_LOCK_MINUTES * 60 }
        });
      }

      throw new AppError('PIN incorrecto.', { statusCode: 400, code: 'PIN_INVALID' });
    }

    await this.olderAdultRepository.update(profile.id, {
      failedPinAttempts: 0,
      pinLockedUntil: null
    });
    // Invalida el token del dispositivo: para volver a entrar hace falta un código nuevo.
    await this.olderAdultRepository.bumpSessionVersion(profile.id);

    return {
      message:
        'Cerraste tu sesión. Para volver a entrar, pídele a tu familiar un código nuevo.'
    };
  }
}

module.exports = { SeniorAppService, PIN_MAX_ATTEMPTS, PIN_LOCK_MINUTES };
