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

  async markUsed({ id }) {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() }
    });
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
