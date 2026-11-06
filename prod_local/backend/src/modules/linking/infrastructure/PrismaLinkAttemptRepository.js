'use strict';

/** Prisma adapter de los intentos de canje (HU-007). */
class PrismaLinkAttemptRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async countFailuresSince(ip, since) {
    if (!ip) return 0;

    return this.prisma.linkAttempt.count({
      where: { ip, success: false, createdAt: { gte: since } }
    });
  }

  async record({ ip = null, code = null, success }) {
    return this.prisma.linkAttempt.create({ data: { ip, code, success } });
  }
}

module.exports = { PrismaLinkAttemptRepository };
