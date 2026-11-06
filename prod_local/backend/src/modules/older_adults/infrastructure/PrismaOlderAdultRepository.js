'use strict';

/**
 * Adaptador Prisma del perfil del adulto mayor.
 *
 * Un adulto mayor es un `User` con rol `SENIOR`; no existe una colección
 * aparte. Así el modelo de `prod` (un usuario por actor) se mantiene y la
 * relación con el familiar sigue siendo `caregiverId`.
 *
 * MongoDB guarda documentos, no columnas: `deletedAt: null` solo coincide con
 * un campo escrito como null, no con uno ausente. Por eso las consultas usan
 * `isSet: false` además de `null`.
 */
const NOT_DELETED = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]
};

class PrismaOlderAdultRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async listByCaregiver(caregiverId) {
    return this.prisma.user.findMany({
      where: { caregiverId, role: 'SENIOR', ...NOT_DELETED },
      orderBy: [{ createdAt: 'asc' }]
    });
  }

  async findOwned({ id, caregiverId }) {
    return this.prisma.user.findFirst({
      where: { id, caregiverId, role: 'SENIOR', ...NOT_DELETED }
    });
  }

  async findById(id) {
    return this.prisma.user.findFirst({
      where: { id, role: 'SENIOR', ...NOT_DELETED }
    });
  }

  async create(data) {
    return this.prisma.user.create({ data: { ...data, role: 'SENIOR', deletedAt: null } });
  }

  async update(id, data) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async bumpSessionVersion(id) {
    const current = await this.prisma.user.findUnique({ where: { id }, select: { sessionVersion: true } });

    return this.prisma.user.update({
      where: { id },
      data: { sessionVersion: (current?.sessionVersion ?? 0) + 1 }
    });
  }
}

module.exports = { PrismaOlderAdultRepository };
