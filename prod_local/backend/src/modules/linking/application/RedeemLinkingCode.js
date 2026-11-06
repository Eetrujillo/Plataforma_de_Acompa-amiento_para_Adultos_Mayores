'use strict';

const { AppError, NotFoundError, ValidationError } = require('../../../shared/errors');
const { CONSENT_TEXT, CONSENT_VERSION } = require('../../../shared/consent');
const { toAppProfile } = require('../../older_adults/domain/olderAdult');

const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;
const MAX_ATTEMPTS = 3;
const LOCK_MINUTES = 10;

function normalizeCode(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

/**
 * HU-007: canje del código de vinculación.
 *
 * El dispositivo del adulto mayor no tiene cuenta ni contraseña: el código es
 * su credencial. Se bloquea el canje tras 3 fallos por IP para evitar fuerza
 * bruta, y el código es de un solo uso.
 *
 * Ports: pairingRepository, olderAdultRepository, linkAttemptRepository, tokenService
 */
class RedeemLinkingCode {
  constructor({
    pairingRepository,
    olderAdultRepository,
    linkAttemptRepository,
    tokenService,
    now = () => new Date()
  }) {
    this.pairingRepository = pairingRepository;
    this.olderAdultRepository = olderAdultRepository;
    this.linkAttemptRepository = linkAttemptRepository;
    this.tokenService = tokenService;
    this.now = now;
  }

  async execute({ code, consentAccepted, consentVersion, ip = null } = {}) {
    const now = this.now();
    const since = new Date(now.getTime() - LOCK_MINUTES * 60_000);
    const failures = await this.linkAttemptRepository.countFailuresSince(ip, since);

    if (failures >= MAX_ATTEMPTS) {
      throw new AppError('Demasiados intentos. Espera unos minutos antes de intentar de nuevo.', {
        statusCode: 429,
        code: 'LINK_ATTEMPTS_LOCKED',
        details: { retryAfterSeconds: LOCK_MINUTES * 60 }
      });
    }

    const normalized = normalizeCode(code);

    if (!CODE_PATTERN.test(normalized)) {
      await this.fail(ip, normalized);
      throw new AppError('Pídele a tu familiar un código nuevo.', {
        statusCode: 400,
        code: 'LINK_CODE_INVALID'
      });
    }

    if (consentAccepted !== true) {
      throw new AppError('Debes aceptar el consentimiento para vincular la app.', {
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

    const record = await this.pairingRepository.findByCode(normalized);

    if (!record || !record.seniorId) {
      await this.fail(ip, normalized);
      throw new AppError('Pídele a tu familiar un código nuevo.', {
        statusCode: 400,
        code: 'LINK_CODE_INVALID'
      });
    }

    if (record.usedAt) {
      await this.fail(ip, normalized);
      throw new AppError('Este código ya se usó. Pídele a tu familiar uno nuevo.', {
        statusCode: 400,
        code: 'LINK_CODE_USED'
      });
    }

    if (new Date(record.expiresAt).getTime() <= now.getTime()) {
      await this.fail(ip, normalized);
      throw new AppError('El código venció. Pídele a tu familiar uno nuevo.', {
        statusCode: 400,
        code: 'LINK_CODE_EXPIRED'
      });
    }

    const profile = await this.olderAdultRepository.findById(record.seniorId);

    if (!profile) throw new NotFoundError('Perfil no encontrado.');

    const consentAcceptedAt = now;
    const updated = await this.olderAdultRepository.update(profile.id, {
      caregiverId: record.caregiverId,
      linkStatus: 'linked',
      consentVersion: CONSENT_VERSION,
      consentAcceptedAt
    });

    // Un token nuevo por vinculación: cualquier token anterior deja de servir.
    const withVersion = await this.olderAdultRepository.bumpSessionVersion(updated.id);

    await this.pairingRepository.markUsed({ id: record.id, seniorId: profile.id });
    await this.linkAttemptRepository.record({ ip, code: normalized, success: true });

    const sessionToken = this.tokenService.sign({
      sub: withVersion.id,
      role: withVersion.role,
      email: withVersion.email,
      sessionVersion: withVersion.sessionVersion
    });

    return {
      olderAdult: toAppProfile(withVersion),
      message: 'Vinculación exitosa. Ya puedes ver tus actividades.',
      sessionToken,
      consent: { version: CONSENT_VERSION, acceptedAt: consentAcceptedAt },
      consentText: CONSENT_TEXT
    };
  }

  async fail(ip, code) {
    await this.linkAttemptRepository.record({ ip, code, success: false });
  }
}

module.exports = { RedeemLinkingCode, MAX_ATTEMPTS, LOCK_MINUTES, normalizeCode };
