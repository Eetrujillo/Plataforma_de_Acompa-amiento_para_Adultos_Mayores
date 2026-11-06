'use strict';

/**
 * Prisma adapter for the PairingToken collection (HU-006, rework QR-only de L9).
 *
 * La credencial es un token opaco que sólo viaja dentro del QR: acá se guarda su SHA-256
 * (`tokenHash`), nunca el valor en claro. El token pertenece a un perfil, se invalida cuando otro
 * lo reemplaza (`invalidatedAt`) y se reclama con una escritura condicional para que el canje sea
 * de un solo uso incluso con dos pedidos simultáneos.
 */

/**
 * `usedAt: null` no matchea un documento donde el campo no existe, y MongoDB no guarda un campo
 * sólo porque el schema lo permita. La creación escribe los dos nulos de forma explícita; el
 * `isSet: false` cubre cualquier documento escrito sin ellos.
 */
const NOT_USED = Object.freeze({ OR: [{ usedAt: null }, { usedAt: { isSet: false } }] });
const NOT_INVALIDATED = Object.freeze({
  OR: [{ invalidatedAt: null }, { invalidatedAt: { isSet: false } }]
});

class PrismaPairingRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * Persiste el token por su huella. El valor en claro no entra a esta función, así que no puede
   * terminar en la base por accidente.
   */
  async create({ tokenHash, caregiverId, seniorId, expiresAt }) {
    return this.prisma.pairingToken.create({
      // `usedAt` e `invalidatedAt` se escriben explícitos: si faltaran, el filtro `null` del
      // reclamo no los vería y el token nacería imposible de canjear.
      data: { tokenHash, caregiverId, seniorId, expiresAt, usedAt: null, invalidatedAt: null }
    });
  }

  /** El canje busca por hash: es lo único que la base conoce del token. */
  async findByTokenHash(tokenHash) {
    return this.prisma.pairingToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Invalida los tokens anteriores de ese perfil que sigan vivos.
   *
   * Un token reemplazado no es un token usado: `usedAt` diría que alguien lo canjeó. Se marca con
   * `invalidatedAt` para no mentir en los datos, aunque el mensaje que recibe el adulto mayor sea
   * el mismo que el de uno vencido (S2).
   */
  async invalidateOutstanding({ caregiverId, seniorId }) {
    return this.prisma.pairingToken.updateMany({
      where: { caregiverId, seniorId, AND: [NOT_USED, NOT_INVALIDATED] },
      data: { invalidatedAt: new Date() }
    });
  }

  /**
   * Reclama el token en una sola operación: sólo gana el primero que llega.
   *
   * `updateMany` con las condiciones en el filtro convierte "leer y después marcar" en una
   * escritura atómica, que es lo que hace cierto el "un solo uso" cuando dos pedidos llegan a la
   * vez. Un `update` por id obligaría a confiar en que nadie más está mirando.
   */
  async claim({ id }) {
    const now = new Date();

    const { count } = await this.prisma.pairingToken.updateMany({
      where: { id, AND: [NOT_USED, NOT_INVALIDATED, { expiresAt: { gt: now } }] },
      data: { usedAt: now }
    });

    return { claimed: count === 1 };
  }
}

module.exports = { PrismaPairingRepository };
