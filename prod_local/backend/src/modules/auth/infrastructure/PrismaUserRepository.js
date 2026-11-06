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

  async create({
    email,
    fullName,
    phone,
    role,
    passwordHash = null,
    caregiverId = null,
    emailVerifiedAt = null,
    acceptedTermsAt = null,
    termsVersion = null,
    ipAddress = null
  }) {
    try {
      return await this.prisma.user.create({
        data: {
          email,
          fullName,
          phone,
          role,
          passwordHash,
          caregiverId,
          emailVerifiedAt,
          acceptedTermsAt,
          termsVersion,
          ipAddress
        }
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

  /**
   * Persists the consecutive-failed-login counter and its lock.
   *
   * Both fields are nullable in the schema on purpose: the documents that already exist
   * in Mongo do not carry them, so a `null` means "no attempts, not locked".
   */
  async updateLoginLock(id, { failedLoginAttempts, lockedUntil }) {
    return this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts, lockedUntil }
    });
  }

  /** HU-004: guarda el nuevo hash e invalida las sesiones abiertas. */
  async updatePassword(id, passwordHash) {
    const current = await this.prisma.user.findUnique({
      where: { id },
      select: { sessionVersion: true }
    });

    return this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        sessionVersion: (current?.sessionVersion ?? 0) + 1
      }
    });
  }
}

module.exports = { PrismaUserRepository };
