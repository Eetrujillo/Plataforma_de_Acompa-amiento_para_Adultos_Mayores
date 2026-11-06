'use strict';

const {
  PAIRING_TOKEN_ALREADY_USED_MESSAGE,
  PAIRING_TOKEN_INVALID_MESSAGE,
  PAIRING_TOKEN_NOT_FOUND_MESSAGE,
  hashPairingToken,
  isValidPairingToken,
  isPairingTokenRedeemable
} = require('../domain/pairingToken');
const { SeniorAlreadyLinkedError } = require('../domain/pairingErrors');
const { isPendingLinkStatus, toLinkedSeniorPayload } = require('../domain/seniorLinkState');
const { sessionClaims } = require('../../../shared/session/sessionVersion');
const { ConflictError, NotFoundError, ValidationError } = require('../../../shared/errors');

/**
 * Links a senior device to the profile its pairing token points at.
 *
 * Ports: pairingRepository, userRepository, tokenService
 *
 * El canje es de un solo uso en serio (S4): el token se reclama con una escritura condicional y
 * sólo el pedido que gana sigue. Sin eso, dos teléfonos con el mismo QR vinculaban dos veces, que
 * es el mismo defecto que HU-004 corrigió para el token de reseteo.
 *
 * T7/L9: el canje ya no crea perfiles. Todo token apunta a un senior que el familiar creó desde
 * el panel, así que el cuerpo del pedido no aporta datos de la ficha.
 */
class RedeemPairingToken {
  constructor({ pairingRepository, userRepository, tokenService }) {
    this.pairingRepository = pairingRepository;
    this.userRepository = userRepository;
    this.tokenService = tokenService;
  }

  async execute({ token } = {}) {
    // Un valor que no pudo haber emitido este sistema no se hashea ni se busca. El mensaje no
    // repite el token: este cuerpo llega al cliente y a los logs.
    if (!isValidPairingToken(token)) {
      throw new ValidationError(PAIRING_TOKEN_INVALID_MESSAGE);
    }

    // Se busca por hash: la credencial en claro no está en la base.
    const record = await this.pairingRepository.findByTokenHash(hashPairingToken(token));

    if (!record) {
      throw new NotFoundError(PAIRING_TOKEN_NOT_FOUND_MESSAGE);
    }

    if (record.usedAt) {
      throw new ConflictError(PAIRING_TOKEN_ALREADY_USED_MESSAGE);
    }

    // Vencido e invalidado comparten mensaje: el adulto mayor no puede hacer nada distinto y
    // decir cuál de los dos fue sólo ayuda a quien está probando valores (S2).
    if (!isPairingTokenRedeemable(record)) {
      throw new ValidationError(PAIRING_TOKEN_INVALID_MESSAGE);
    }

    // El perfil se revisa antes de quemar el token, para que un perfil ya vinculado no consuma
    // un canje inútilmente.
    const target = await this.assertLinkable(record.seniorId, record.caregiverId);

    // El reclamo va antes de escribir el perfil. Si la escritura falla, el token queda quemado y
    // el familiar puede generar otro: falla cerrado, como el reseteo de HU-004.
    const { claimed } = await this.pairingRepository.claim({ id: record.id });

    if (!claimed) {
      throw new ConflictError(PAIRING_TOKEN_ALREADY_USED_MESSAGE);
    }

    const senior = await this.userRepository.markLinked(target.id);
    const jwt = this.tokenService.sign(sessionClaims(senior));

    // S5 (L5): la respuesta conserva la proyección de auth que ya consume la app publicada y le
    // suma `linkStatus`/`timezone`. Ningún campo viejo desaparece.
    return { token: jwt, senior: toLinkedSeniorPayload(senior) };
  }

  /**
   * El perfil de este token tiene que seguir existiendo, seguir siendo del dueño del token y
   * seguir pendiente.
   *
   * Un perfil que ya no está y uno de otra cuenta dan la misma respuesta que un token consumido:
   * el token no puede vincular nada y no se confirma la existencia de un id ajeno. Hoy nada
   * reasigna un perfil entre familiares; el chequeo está para que eso siga siendo irrelevante.
   */
  async assertLinkable(seniorId, caregiverId) {
    const senior = await this.userRepository.findById(seniorId);

    if (!senior || senior.caregiverId !== caregiverId) {
      throw new ConflictError(PAIRING_TOKEN_ALREADY_USED_MESSAGE);
    }

    if (!isPendingLinkStatus(senior.linkStatus)) {
      throw new SeniorAlreadyLinkedError();
    }

    return senior;
  }
}

module.exports = { RedeemPairingToken };
