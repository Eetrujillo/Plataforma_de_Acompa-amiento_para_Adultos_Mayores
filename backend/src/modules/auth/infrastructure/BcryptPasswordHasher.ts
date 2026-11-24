import bcrypt from 'bcryptjs';

/** Costo bcrypt fijado por el anteproyecto: 10. */
const BCRYPT_COST = 10;

/** Adaptador bcrypt del puerto PasswordHasher. */
export class BcryptPasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, BCRYPT_COST);
  }
}
