'use strict';

/**
 * Prisma adapter for the PasswordResetToken collection.
 *
 * Se mantiene separada de `EmailVerificationToken` a propósito: cada colección guarda
 * un único ámbito de uso, así un enlace no puede servir para las dos cosas y el
 * `tokenHash @unique` no mezcla tipos.
 */
class PrismaPasswordResetRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async create({ userId, tokenHash, expiresAt }) {
    return this.prisma.passwordResetToken.create({
      // `usedAt` se escribe explícito: MongoDB no guarda un campo solo porque el
      // schema lo permita, y el filtro `usedAt: null` de Prisma no matchea un campo
      // ausente. Mismo detalle que en el repositorio de verificación.
      data: { userId, tokenHash, expiresAt, usedAt: null }
    });
  }

  async findByHash(tokenHash) {
    return this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Consume el token de forma atómica: solo gana el primero que llega.
   *
   * `updateMany` con `usedAt: null` en el filtro convierte "leer y después marcar" en una
   * sola operación, que es lo que hace cierto el "un solo uso" cuando dos pedidos llegan
   * a la vez. Un `update` por id obligaría a confiar en que nadie más está mirando.
   */
  async markUsed({ id }) {
    const { count } = await this.prisma.passwordResetToken.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() }
    });

    return { claimed: count === 1 };
  }

  /** Quema los enlaces pendientes: solo sirve el último que se envió. */
  async invalidateForUser(userId) {
    return this.prisma.passwordResetToken.updateMany({
      where: { userId, OR: [{ usedAt: null }, { usedAt: { isSet: false } }] },
      data: { usedAt: new Date() }
    });
  }
}

module.exports = { PrismaPasswordResetRepository };
