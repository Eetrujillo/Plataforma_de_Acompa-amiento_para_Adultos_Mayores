'use strict';

/** Prisma adapter de los tokens de recuperación de contraseña (HU-004). */
class PrismaPasswordResetRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async create({ userId, tokenHash, expiresAt }) {
    return this.prisma.passwordResetToken.create({
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

  async invalidateForUser(userId) {
    return this.prisma.passwordResetToken.updateMany({
      where: { userId, OR: [{ usedAt: null }, { usedAt: { isSet: false } }] },
      data: { usedAt: new Date() }
    });
  }
}

module.exports = { PrismaPasswordResetRepository };
