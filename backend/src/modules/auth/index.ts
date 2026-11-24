import { RegisterCaregiver } from './application/RegisterCaregiver.ts';
import { createAuthRoutes } from './infrastructure/authRoutes.ts';
import type { PasswordHasherPort, UserRepositoryPort } from './application/RegisterCaregiver.ts';
import type { Router } from 'express';

export interface AuthDependencies {
  userRepository: UserRepositoryPort;
  passwordHasher: PasswordHasherPort;
  /** Reloj del servidor; fija acceptedTermsAt (Ley 1581). */
  clock: () => Date;
  /** Versión de la política de tratamiento de datos (env TERMS_VERSION). */
  termsVersion: string;
}

/** Punto de montaje del módulo auth: compone caso de uso y devuelve el router. */
export function buildAuthRouter(deps: AuthDependencies): Router {
  const registerCaregiver = new RegisterCaregiver({
    userRepository: deps.userRepository,
    passwordHasher: deps.passwordHasher,
    clock: { now: deps.clock },
    termsVersion: deps.termsVersion,
  });
  return createAuthRoutes(registerCaregiver);
}

export { RegisterCaregiver } from './application/RegisterCaregiver.ts';
export type {
  PasswordHasherPort,
  StoredUser,
  UserRepositoryPort,
} from './application/RegisterCaregiver.ts';
export { BcryptPasswordHasher } from './infrastructure/BcryptPasswordHasher.ts';
export { createMongooseUserRepository } from './infrastructure/MongooseUserRepository.ts';
