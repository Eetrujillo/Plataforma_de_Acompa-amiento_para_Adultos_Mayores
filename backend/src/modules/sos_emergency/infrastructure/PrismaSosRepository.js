'use strict';

/**
 * Prisma adapter for the SosAlert collection.
 */
class PrismaSosRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async create(data) {
    return this.prisma.sosAlert.create({ data });
  }

  async findById(id) {
    return this.prisma.sosAlert.findUnique({ where: { id } });
  }

  async findActiveBySeniorIds(seniorIds) {
    return this.prisma.sosAlert.findMany({
      where: { seniorId: { in: seniorIds }, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });
  }

  async resolve({ id, resolvedAt, resolvedBy }) {
    return this.prisma.sosAlert.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt, resolvedBy }
    });
  }
}

module.exports = { PrismaSosRepository };
