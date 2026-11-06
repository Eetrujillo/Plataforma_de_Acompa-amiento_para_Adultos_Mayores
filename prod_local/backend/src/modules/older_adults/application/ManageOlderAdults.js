'use strict';

const { randomInt, randomUUID } = require('node:crypto');

const { NotFoundError, ValidationError, AppError } = require('../../../shared/errors');
const {
  normalizeName,
  normalizePin,
  normalizeTimeZone,
  toLinkingCode,
  toPublicOlderAdult
} = require('../domain/olderAdult');

/** Alfabeto sin caracteres que se confunden al dictarlos (I, O, 0, 1). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

function generateCode() {
  let code = '';

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }

  return code;
}

/**
 * HU-005, HU-006 y HU-010: casos de uso del perfil del adulto mayor.
 *
 * Se agrupan en una sola clase porque comparten las mismas reglas y puertos;
 * cada método es un caso de uso independiente.
 *
 * Ports: olderAdultRepository, pairingRepository, passwordHasher, qrGenerator, config
 */
class ManageOlderAdults {
  constructor({ olderAdultRepository, pairingRepository, passwordHasher, qrGenerator, config }) {
    this.olderAdultRepository = olderAdultRepository;
    this.pairingRepository = pairingRepository;
    this.passwordHasher = passwordHasher;
    this.qrGenerator = qrGenerator;
    this.config = config;
  }

  async list({ caregiverId }) {
    const profiles = await this.olderAdultRepository.listByCaregiver(caregiverId);
    return { olderAdults: profiles.map(toPublicOlderAdult) };
  }

  async get({ caregiverId, id }) {
    const profile = await this.olderAdultRepository.findOwned({ id, caregiverId });

    if (!profile) throw new NotFoundError('Perfil no encontrado.');

    return { olderAdult: toPublicOlderAdult(profile) };
  }

  async create({ caregiverId, name, pin, timeZone }) {
    const fullName = normalizeName(name);
    const rawPin = normalizePin(pin, { required: true });
    const zone = normalizeTimeZone(timeZone);
    const pinHash = await this.passwordHasher.hash(rawPin);

    const created = await this.olderAdultRepository.create({
      // El adulto mayor no tiene correo propio: se usa uno sintético único para
      // respetar el índice de `email` sin pedirle un dato que no tiene.
      email: `senior+${randomUUID().slice(0, 12)}@seniors.local`,
      fullName,
      passwordHash: null,
      caregiverId,
      timeZone: zone,
      pinHash,
      linkStatus: 'pending',
      emailVerifiedAt: new Date()
    });

    return {
      olderAdult: toPublicOlderAdult(created),
      message: 'Perfil creado. Queda pendiente de vincular.'
    };
  }

  async update({ caregiverId, id, name, pin, timeZone }) {
    const profile = await this.olderAdultRepository.findOwned({ id, caregiverId });

    if (!profile) throw new NotFoundError('Perfil no encontrado.');

    const data = {
      fullName: normalizeName(name),
      timeZone: normalizeTimeZone(timeZone)
    };

    const rawPin = normalizePin(pin, { required: false });
    if (rawPin) data.pinHash = await this.passwordHasher.hash(rawPin);

    const updated = await this.olderAdultRepository.update(id, data);

    return { olderAdult: toPublicOlderAdult(updated), message: 'Perfil actualizado.' };
  }

  async generateLinkingCode({ caregiverId, id }) {
    const profile = await this.olderAdultRepository.findOwned({ id, caregiverId });

    if (!profile) throw new NotFoundError('Perfil no encontrado.');

    if (profile.linkStatus === 'linked') {
      throw new AppError('Este adulto mayor ya está vinculado.', {
        statusCode: 400,
        code: 'OLDER_ADULT_ALREADY_LINKED'
      });
    }

    const { ttlMinutes, maxGenerationAttempts } = {
      ttlMinutes: this.config.pairing.profileTtlMinutes ?? this.config.pairing.ttlMinutes,
      maxGenerationAttempts: this.config.pairing.maxGenerationAttempts
    };
    let code = null;

    for (let attempt = 0; attempt < maxGenerationAttempts; attempt += 1) {
      const candidate = generateCode();
      if (!(await this.pairingRepository.existsByCode(candidate))) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new ValidationError('No pudimos generar un código único. Inténtalo de nuevo.');
    }

    // Un código nuevo invalida el anterior: el familiar solo puede tener uno vigente.
    await this.pairingRepository.invalidateForSenior(id);

    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
    await this.pairingRepository.create({ code, caregiverId, seniorId: id, expiresAt });

    const qrDataUrl = await this.qrGenerator.toDataUrl(code);

    return {
      olderAdult: toPublicOlderAdult(profile),
      linkingCode: toLinkingCode({ code, expiresAt, qrDataUrl }),
      message: 'Código de vinculación generado.'
    };
  }

  async unlink({ caregiverId, id }) {
    const profile = await this.olderAdultRepository.findOwned({ id, caregiverId });

    if (!profile) throw new NotFoundError('Perfil no encontrado.');

    const updated = await this.olderAdultRepository.update(id, {
      caregiverId: null,
      linkStatus: 'pending'
    });

    // Invalida el token que el celular tenía guardado.
    await this.olderAdultRepository.bumpSessionVersion(id);
    await this.pairingRepository.invalidateForSenior(id);

    return {
      olderAdult: toPublicOlderAdult(updated),
      message:
        'Adulto mayor desvinculado. Su app dejará de mostrar actividades y alertas.'
    };
  }
}

module.exports = { ManageOlderAdults, CODE_ALPHABET, CODE_LENGTH, generateCode };
