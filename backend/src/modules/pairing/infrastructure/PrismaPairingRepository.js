'use strict';

/**
 * Prisma adapter for the PairingCode collection.
 */
class PrismaPairingRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async existsByCode(code) {
    const found = await this.prisma.pairingCode.findUnique({ where: { code }, select: { id: true } });
    return Boolean(found);
  }

  async create({ code, caregiverId, expiresAt }) {
    return this.prisma.pairingCode.create({ data: { code, caregiverId, expiresAt } });
  }

  async findByCode(code) {
    return this.prisma.pairingCode.findUnique({ where: { code } });
  }

  async markUsed({ id, seniorId }) {
    return this.prisma.pairingCode.update({
      where: { id },
      data: { seniorId, usedAt: new Date() }
    });
  }
}

module.exports = { PrismaPairingRepository };
