'use strict';

/**
 * Adaptador Prisma de actividades y marcas.
 *
 * `Activity` guarda la definición y la primera ocurrencia; `ActivityCompletion`
 * guarda una marca por actividad y día (HU-018/HU-019), lo que permite repetir
 * la misma actividad sin pisar el historial.
 */
class PrismaActivityRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * `active` puede faltar en documentos antiguos; `NOT active: false` los
   * incluye. `deletedAt` necesita además `isSet: false` porque Prisma no
   * equipara un campo ausente con null en MongoDB.
   */
  static notDeleted() {
    return {
      NOT: { active: false },
      OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
    };
  }

  async create(data) {
    return this.prisma.activity.create({ data: { ...data, active: true, deletedAt: null } });
  }

  async findById(id) {
    return this.prisma.activity.findUnique({ where: { id } });
  }

  async findActiveById(id) {
    return this.prisma.activity.findFirst({
      where: { id, ...PrismaActivityRepository.notDeleted() }
    });
  }

  async listBySenior(seniorId) {
    return this.prisma.activity.findMany({
      where: { seniorId, ...PrismaActivityRepository.notDeleted() },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }, { createdAt: 'asc' }]
    });
  }

  async listByCaregiver({ caregiverId, seniorId = null }) {
    return this.prisma.activity.findMany({
      where: {
        createdBy: caregiverId,
        ...PrismaActivityRepository.notDeleted(),
        ...(seniorId ? { seniorId } : {})
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }, { createdAt: 'asc' }]
    });
  }

  async findBySeniorAndDate({ seniorId, scheduledDate }) {
    return this.prisma.activity.findMany({
      where: { seniorId, scheduledDate, ...PrismaActivityRepository.notDeleted() },
      orderBy: { scheduledTime: 'asc' }
    });
  }

  async update(id, data) {
    return this.prisma.activity.update({ where: { id }, data });
  }

  async softDelete(id, now = new Date()) {
    return this.prisma.activity.update({
      where: { id },
      data: { active: false, deletedAt: now }
    });
  }

  async updateStatus({ id, status, completedAt = null }) {
    return this.prisma.activity.update({ where: { id }, data: { status, completedAt } });
  }

  async listCompletions({ seniorId, occurrenceDate }) {
    return this.prisma.activityCompletion.findMany({
      where: { seniorId, occurrenceDate }
    });
  }

  async findCompletion({ activityId, occurrenceDate }) {
    return this.prisma.activityCompletion.findUnique({
      where: { activityId_occurrenceDate: { activityId, occurrenceDate } }
    });
  }

  /**
   * Idempotente: la hora se fija solo al crear la marca. Un segundo toque no
   * mueve la hora del primero.
   */
  async upsertCompletion({ activityId, seniorId, occurrenceDate, completedAt }) {
    const existing = await this.findCompletion({ activityId, occurrenceDate });
    if (existing) return existing;

    try {
      return await this.prisma.activityCompletion.create({
        data: { activityId, seniorId, occurrenceDate, completedAt }
      });
    } catch (error) {
      // Dos toques simultáneos: el índice único decide y se devuelve el ganador.
      if (error?.code === 'P2002') {
        return this.findCompletion({ activityId, occurrenceDate });
      }

      throw error;
    }
  }

  async deleteCompletion({ activityId, occurrenceDate }) {
    return this.prisma.activityCompletion.deleteMany({
      where: { activityId, occurrenceDate }
    });
  }
}

module.exports = { PrismaActivityRepository };
