'use strict';

/**
 * Prisma adapter for the Activity collection.
 */
class PrismaActivityRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async create(data) {
    return this.prisma.activity.create({ data });
  }

  async findById(id) {
    return this.prisma.activity.findUnique({ where: { id } });
  }

  async findBySeniorAndDate({ seniorId, scheduledDate }) {
    return this.prisma.activity.findMany({
      where: { seniorId, scheduledDate },
      orderBy: { scheduledTime: 'asc' }
    });
  }

  async updateStatus({ id, status, completedAt = null }) {
    return this.prisma.activity.update({ where: { id }, data: { status, completedAt } });
  }
}

module.exports = { PrismaActivityRepository };
