'use strict';

const { SosAlert, toPublicSosAlert } = require('../domain/SosAlert');
const { NotFoundError } = require('../../../shared/errors');

/**
 * Raises an emergency alert and notifies the senior's caregiver.
 *
 * Ports: sosRepository, userRepository, notifier
 */
class TriggerSosAlert {
  constructor({ sosRepository, userRepository, notifier }) {
    this.sosRepository = sosRepository;
    this.userRepository = userRepository;
    this.notifier = notifier;
  }

  async execute({ seniorId, latitude, longitude, accuracy, message } = {}) {
    const alert = SosAlert.trigger({ seniorId, latitude, longitude, accuracy, message });

    const senior = await this.userRepository.findById(seniorId);

    if (!senior) {
      throw new NotFoundError('senior not found');
    }

    const created = await this.sosRepository.create({
      seniorId: alert.seniorId,
      latitude: alert.latitude,
      longitude: alert.longitude,
      accuracy: alert.accuracy,
      message: alert.message,
      status: alert.status
    });

    const projected = toPublicSosAlert(created);

    await this.notifier.alertTriggered({
      alert: { ...projected, seniorName: senior.fullName },
      caregiverId: senior.caregiverId
    });

    return projected;
  }
}

module.exports = { TriggerSosAlert };
