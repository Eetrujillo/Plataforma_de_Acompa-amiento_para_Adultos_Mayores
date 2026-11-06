'use strict';

/**
 * Prisma adapter for the PairingCode collection.
 *
 * HU-006: el código ahora pertenece a un perfil (`seniorId`), se invalida cuando otro lo
 * reemplaza (`invalidatedAt`) y se reclama con una escritura condicional para que el canje sea
 * de un solo uso incluso con dos pedidos simultáneos.
 */

/**
 * `usedAt: null` no matchea un documento donde el campo no existe, y MongoDB no guarda un
 * campo sólo porque el schema lo permita. Los códigos emitidos antes de HU-006 no traen
 * `usedAt` ni `invalidatedAt`, así que `isSet: false` es lo que mantiene canjeable un código
 * que ya está en manos de un adulto mayor (S6).
 */
const NOT_USED = Object.freeze({ OR: [{ usedAt: null }, { usedAt: { isSet: false } }] });
const NOT_INVALIDATED = Object.freeze({
  OR: [{ invalidatedAt: null }, { invalidatedAt: { isSet: false } }]
});

class PrismaPairingRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async existsByCode(code) {
    const found = await this.prisma.pairingCode.findUnique({ where: { code }, select: { id: true } });
    return Boolean(found);
  }

  async create({ code, caregiverId, seniorId = null, expiresAt }) {
    return this.prisma.pairingCode.create({
      // `usedAt` e `invalidatedAt` se escriben explícitos: si faltaran, el filtro `null` del
      // reclamo no los vería y el código nacería imposible de canjear.
      data: { code, caregiverId, seniorId, expiresAt, usedAt: null, invalidatedAt: null }
    });
  }

  async findByCode(code) {
    return this.prisma.pairingCode.findUnique({ where: { code } });
  }

  /**
   * Invalida los códigos anteriores de ese perfil que sigan vivos.
   *
   * Un código reemplazado no es un código usado: `usedAt` diría que alguien lo canjeó. Se
   * marca con `invalidatedAt` para no mentir en los datos, aunque el mensaje que recibe el
   * adulto mayor sea el mismo que el de uno vencido (S2).
   */
  async invalidateOutstanding({ caregiverId, seniorId }) {
    return this.prisma.pairingCode.updateMany({
      where: { caregiverId, seniorId, AND: [NOT_USED, NOT_INVALIDATED] },
      data: { invalidatedAt: new Date() }
    });
  }

  /**
   * Reclama el código en una sola operación: sólo gana el primero que llega.
   *
   * `updateMany` con las condiciones en el filtro convierte "leer y después marcar" en una
   * escritura atómica, que es lo que hace cierto el "un solo uso" cuando dos pedidos llegan a
   * la vez. Un `update` por id obligaría a confiar en que nadie más está mirando.
   */
  async claim({ id }) {
    const now = new Date();

    const { count } = await this.prisma.pairingCode.updateMany({
      where: { id, AND: [NOT_USED, NOT_INVALIDATED, { expiresAt: { gt: now } }] },
      data: { usedAt: now }
    });

    return { claimed: count === 1 };
  }

  /** Guarda qué senior nació de este código (rama de compatibilidad de S6). */
  async setSenior({ id, seniorId }) {
    return this.prisma.pairingCode.update({ where: { id }, data: { seniorId } });
  }
}

module.exports = { PrismaPairingRepository };
