'use strict';

/**
 * Notification adapter for emergency events.
 *
 * Primary channel is the caregiver Socket.IO room; an optional push gateway can
 * be injected later without touching the application layer. Notification
 * failures degrade to a log line: they must never block an SOS.
 */
class NotificationAdapter {
  constructor({ io = null, pushGateway = null, logger = console }) {
    this.io = io;
    this.pushGateway = pushGateway;
    this.logger = logger;
  }

  async alertTriggered({ alert, caregiverId }) {
    await this.dispatch({
      caregiverId,
      event: 'sos:triggered',
      payload: alert,
      pushTitle: 'Alerta SOS',
      pushBody: `${alert.seniorName ?? 'Tu familiar'} activó el botón de emergencia`
    });
  }

  async alertResolved({ alert, caregiverId }) {
    await this.dispatch({
      caregiverId,
      event: 'sos:resolved',
      payload: alert,
      pushTitle: 'Alerta SOS resuelta',
      pushBody: 'La alerta de emergencia fue marcada como resuelta'
    });
  }

  async dispatch({ caregiverId, event, payload, pushTitle, pushBody }) {
    if (this.io && caregiverId) {
      this.io.to(`caregiver:${caregiverId}`).emit(event, payload);
    }

    if (this.pushGateway) {
      try {
        await this.pushGateway.send({ caregiverId, title: pushTitle, body: pushBody, data: payload });
      } catch (error) {
        this.logger.warn('[sos] push notification failed', error.message);
      }
    }
  }
}

module.exports = { NotificationAdapter };
