'use strict';

const { PAIRING_CODE_INVALID_MESSAGE, isValidPairingCode, isPairingCodeRedeemable } = require('../domain/pairingCode');
const { SeniorAlreadyLinkedError } = require('../domain/pairingErrors');
const { isPendingLinkStatus, toLinkedSeniorPayload } = require('../domain/seniorLinkState');
const { User } = require('../../auth/domain/User');
const { LINK_STATUS } = require('../../seniors/domain/seniorProfile');
const { sessionClaims } = require('../../../shared/session/sessionVersion');
const { ConflictError, NotFoundError, ValidationError } = require('../../../shared/errors');

const ALREADY_USED_MESSAGE = 'pairing code already used';

/**
 * Links a senior device to the profile the pairing code points at.
 *
 * Ports: pairingRepository, userRepository, tokenService
 *
 * El canje es de un solo uso en serio (HU-006 S4): el código se reclama con una escritura
 * condicional y sólo el pedido que gana sigue. Sin eso, dos teléfonos con el mismo código
 * creaban dos seniors, que es el mismo defecto que HU-004 corrigió para el token de reseteo.
 */
class LinkSeniorApp {
  constructor({ pairingRepository, userRepository, tokenService }) {
    this.pairingRepository = pairingRepository;
    this.userRepository = userRepository;
    this.tokenService = tokenService;
  }

  async execute({ code, fullName, phone } = {}) {
    if (!isValidPairingCode(code)) {
      throw new ValidationError('pairing code must be 6 digits');
    }

    const record = await this.pairingRepository.findByCode(code);

    if (!record) {
      throw new NotFoundError('pairing code not found');
    }

    if (record.usedAt) {
      throw new ConflictError(ALREADY_USED_MESSAGE);
    }

    // Vencido e invalidado comparten mensaje: el adulto mayor no puede hacer nada distinto y
    // decir cuál de los dos fue sólo ayuda a quien está probando códigos (S2).
    if (!isPairingCodeRedeemable(record)) {
      throw new ValidationError(PAIRING_CODE_INVALID_MESSAGE);
    }

    // Con `seniorId` el código canjea ESE perfil, y se revisa antes de quemar el código para
    // que un perfil ya vinculado no consuma un intento inútilmente.
    const target = record.seniorId ? await this.assertLinkable(record.seniorId) : null;

    // El reclamo va antes de escribir el perfil. Si la escritura falla, el código queda
    // quemado y el familiar puede generar otro: falla cerrado, como el reseteo de HU-004.
    const { claimed } = await this.pairingRepository.claim({ id: record.id });

    if (!claimed) {
      throw new ConflictError(ALREADY_USED_MESSAGE);
    }

    const senior = target
      ? await this.userRepository.markLinked(target.id)
      : await this.createSeniorFromLegacyCode({ record, fullName, phone });

    const token = this.tokenService.sign(sessionClaims(senior));

    // S5 (L5): la respuesta conserva la proyección de auth que ya consume la app publicada y
    // le suma `linkStatus`/`timezone`. Ningún campo viejo desaparece.
    return { token, senior: toLinkedSeniorPayload(senior) };
  }

  /**
   * El perfil de este código tiene que seguir existiendo y seguir pendiente. Un perfil que ya
   * no está no se distingue de un código consumido: el código no puede vincular nada.
   */
  async assertLinkable(seniorId) {
    const senior = await this.userRepository.findById(seniorId);

    if (!senior) {
      throw new ConflictError(ALREADY_USED_MESSAGE);
    }

    if (!isPendingLinkStatus(senior.linkStatus)) {
      throw new SeniorAlreadyLinkedError();
    }

    return senior;
  }

  /**
   * Rama de compatibilidad (HU-006 S6): un código emitido antes de esta HU, o por el APK
   * publicado, no trae `seniorId`. Se conserva el comportamiento anterior —crear el senior y
   * dejarlo `LINKED`— para que nadie que ya tenga un código en la mano quede sin vincular.
   *
   * Es transitoria: la app móvil de HU-007 exige el perfil y esta rama se retira con ella.
   * El dueño sale del registro del código, nunca del cuerpo del pedido.
   */
  async createSeniorFromLegacyCode({ record, fullName, phone }) {
    // Redeeming the code is the proof that this device is the senior's, so the profile is
    // born linked; a profile created from the caregiver panel is PENDING until then.
    const senior = User.createSenior({
      fullName,
      phone,
      caregiverId: record.caregiverId,
      linkStatus: LINK_STATUS.LINKED
    });

    const created = await this.userRepository.create({
      email: senior.email,
      fullName: senior.fullName,
      phone: senior.phone,
      role: senior.role,
      caregiverId: senior.caregiverId,
      timezone: senior.timezone,
      linkStatus: senior.linkStatus
    });

    // El registro guarda qué senior nació de este código: es la única traza que los une.
    await this.pairingRepository.setSenior({ id: record.id, seniorId: created.id });

    return created;
  }
}

module.exports = { LinkSeniorApp };
