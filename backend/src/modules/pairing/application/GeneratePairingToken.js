'use strict';

const {
  generatePairingToken,
  hashPairingToken,
  computePairingExpiration
} = require('../domain/pairingToken');
const {
  PairingQrUnavailableError,
  SeniorAlreadyLinkedError,
  SeniorIdRequiredError
} = require('../domain/pairingErrors');
const { isPendingLinkStatus } = require('../domain/seniorLinkState');
const { ROLES } = require('../../auth/domain/User');
const { isValidSeniorId } = require('../../seniors/domain/seniorProfile');
const { ValidationError, SeniorNotFoundError } = require('../../../shared/errors');

/**
 * Emits the QR that links one profile of the caregiver (HU-006 S1/S2/S3, rework de L9).
 *
 * Ports: pairingRepository, userRepository, qrGenerator
 *
 * Ya no existe un código que se pueda dictar: el token vive sólo dentro del QR y en la base queda
 * su SHA-256. El QR pertenece a un perfil concreto (el cuidador sale de la sesión y el perfil del
 * cuerpo, previa comprobación de que es suyo y sigue pendiente).
 */
class GeneratePairingToken {
  constructor({ pairingRepository, userRepository, qrGenerator, config, now = () => new Date() }) {
    this.pairingRepository = pairingRepository;
    this.userRepository = userRepository;
    this.qrGenerator = qrGenerator;
    this.config = config;
    this.now = now;
  }

  async execute({ caregiverId, seniorId } = {}) {
    if (typeof caregiverId !== 'string' || caregiverId.length === 0) {
      throw new ValidationError('caregiverId is required');
    }

    // Ausente o mal formado corta antes de tocar la base: el QR ya no es de la cuenta.
    if (!isValidSeniorId(seniorId)) {
      throw new SeniorIdRequiredError();
    }

    const senior = await this.userRepository.findById(seniorId);

    // Un perfil de otra familia, un id inexistente y una cuenta de cuidador responden igual:
    // distinguirlos confirmaría que el id existe (misma regla que HU-005).
    if (!senior || senior.role !== ROLES.SENIOR || senior.caregiverId !== caregiverId) {
      throw new SeniorNotFoundError();
    }

    if (!isPendingLinkStatus(senior.linkStatus)) {
      throw new SeniorAlreadyLinkedError();
    }

    const token = generatePairingToken();

    // El pedido se arma completo ANTES de tocar la base: si el codificador falla se responde 503
    // y el QR anterior sigue vigente. Es el orden que corrige el defecto de que un fallo de QR
    // dejara al familiar sin QR y con el token anterior ya invalidado.
    let qrCodeDataUrl;

    try {
      qrCodeDataUrl = await this.qrGenerator.toDataUrl(token);
    } catch {
      // La causa no se propaga: el token que acaba de generarse no tiene por qué terminar en un
      // log, y el cliente sólo necesita saber que puede reintentar.
      throw new PairingQrUnavailableError();
    }

    // S2: los tokens anteriores de este perfil se invalidan antes de crear el nuevo. Si la
    // creación falla, el familiar queda sin token nuevo y con el anterior ya inválido: falla
    // cerrado y puede pedir otro.
    await this.pairingRepository.invalidateOutstanding({ caregiverId, seniorId });

    const expiresAt = computePairingExpiration(this.now(), this.config.pairing.ttlMinutes);

    await this.pairingRepository.create({
      tokenHash: hashPairingToken(token),
      caregiverId,
      seniorId,
      expiresAt
    });

    // El token no sale en la respuesta: la única copia en claro es la imagen del QR.
    return { expiresAt, seniorId, qrCodeDataUrl };
  }
}

module.exports = { GeneratePairingToken };
