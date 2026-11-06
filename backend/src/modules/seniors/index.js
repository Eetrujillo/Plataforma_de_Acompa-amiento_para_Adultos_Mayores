'use strict';

const { BcryptPasswordHasher } = require('../auth/infrastructure/BcryptPasswordHasher');
const { CreateSeniorProfile } = require('./application/CreateSeniorProfile');
const { PIN_HASH_ROUNDS } = require('./domain/seniorProfile');
const { createSeniorProfileController } = require('./infrastructure/SeniorProfileController');
const { createSeniorRouter } = require('./infrastructure/seniorRoutes');

/**
 * Seniors slice composition root.
 *
 * The senior is a `User` row, so this slice reuses the auth user repository instead of
 * declaring a second adapter over the same collection.
 */
function createSeniorsModule({ userRepository, authMiddleware }) {
  // Cost 12 on purpose: a four digit PIN has ten thousand combinations, so the hash has to
  // be as expensive as the login hash or more. See `skills/bcrypt-pin.md`.
  const pinHasher = new BcryptPasswordHasher({ saltRounds: PIN_HASH_ROUNDS });

  const controller = createSeniorProfileController({
    createSeniorProfile: new CreateSeniorProfile({ userRepository, pinHasher })
  });

  return {
    router: createSeniorRouter({ controller, authMiddleware })
  };
}

module.exports = { createSeniorsModule };
