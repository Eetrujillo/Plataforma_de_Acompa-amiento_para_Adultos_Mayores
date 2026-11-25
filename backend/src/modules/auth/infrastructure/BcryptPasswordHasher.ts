import bcrypt from 'bcryptjs';

/** Costo bcrypt fijado por el anteproyecto: 10. */
const BCRYPT_COST = 10;

/** Adaptador bcrypt del puerto PasswordHasher (HU-001) y del comparador de sesión (HU-003). */
export class BcryptPasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, BCRYPT_COST);
  }

  /** HU-003: la comparación sólo vive en el puerto — el dominio jamás compara contraseñas. */
  async compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}
