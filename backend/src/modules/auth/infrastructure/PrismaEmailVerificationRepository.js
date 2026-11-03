'use strict';

/**
 * Prisma adapter for the EmailVerificationToken collection.
 */
class PrismaEmailVerificationRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async create({ userId, tokenHash, expiresAt }) {
    return this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt }
    });
  }

  async findByHash(tokenHash) {
    return this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  }

  async markUsed({ id }) {
    return this.prisma.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() }
    });
  }

  /**
   * Burns every pending token of the user, so only the newest link works.
   */
  async invalidateForUser(userId) {
    return this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() }
    });
  }
}

module.exports = { PrismaEmailVerificationRepository };
