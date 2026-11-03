'use strict';

const { ConflictError } = require('../../../shared/errors');

const UNIQUE_CONSTRAINT_CODE = 'P2002';

/**
 * Prisma adapter for the User collection.
 */
class PrismaUserRepository {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async findByEmail(email) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create({ email, fullName, phone, role, passwordHash = null, caregiverId = null, emailVerifiedAt = null }) {
    try {
      return await this.prisma.user.create({
        data: { email, fullName, phone, role, passwordHash, caregiverId, emailVerifiedAt }
      });
    } catch (error) {
      if (error.code === UNIQUE_CONSTRAINT_CODE) {
        throw new ConflictError('Email is already registered');
      }

      throw error;
    }
  }

  async listSeniorsByCaregiver(caregiverId) {
    return this.prisma.user.findMany({ where: { caregiverId, role: 'SENIOR' } });
  }

  async markEmailVerified(id) {
    return this.prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }
}

module.exports = { PrismaUserRepository };
