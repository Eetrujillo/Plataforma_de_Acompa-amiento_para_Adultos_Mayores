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
      // `usedAt` is written explicitly: MongoDB does not store a field just because the
      // schema allows it, and Prisma's `usedAt: null` filter only matches a real null,
      // never a missing field.
      data: { userId, tokenHash, expiresAt, usedAt: null }
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
   *
   * Both shapes have to be matched: `usedAt: null` covers the records this adapter
   * writes, and `{ isSet: false }` covers records created before the field was
   * written explicitly (MongoDB stores documents, not schema defaults).
   */
  async invalidateForUser(userId) {
    return this.prisma.emailVerificationToken.updateMany({
      where: { userId, OR: [{ usedAt: null }, { usedAt: { isSet: false } }] },
      data: { usedAt: new Date() }
    });
  }
}

module.exports = { PrismaEmailVerificationRepository };
