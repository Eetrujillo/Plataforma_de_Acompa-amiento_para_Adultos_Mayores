import { AppError } from '../../../shared/errors/AppError.ts';
import {
  collapseSpaces,
  createConsentEvidence,
  isValidEmailFormat,
  isValidFullName,
  isValidPassword,
  isValidPhone,
  normalizeEmail,
  User,
} from '../domain/User.ts';
import type { UserEntity, UserRole } from '../domain/User.ts';

/** Usuario tal como lo devuelve el repositorio, ya con id de persistencia. */
export interface StoredUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

/**
 * Puerto de persistencia. Los métodos reciben el correo ya normalizado;
 * el caso de uso garantiza esa normalización antes de llamar.
 */
export interface UserRepositoryPort {
  findByEmail(email: string): Promise<StoredUser | null>;
  save(user: UserEntity): Promise<StoredUser>;
}

/** Puerto de hashing de contraseñas. El costo (bcrypt 10) es decisión del adaptador. */
export interface PasswordHasherPort {
  hash(plainPassword: string): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export interface RegisterCaregiverDeps {
  userRepository: UserRepositoryPort;
  passwordHasher: PasswordHasherPort;
  clock: Clock;
  /** Versión de la política de tratamiento de datos (TERMS_VERSION). */
  termsVersion: string;
}

export interface RegisterCaregiverCommand {
  fullName: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
  /** Opcional, sólo si el cliente lo manda (docs/auth-api.md). */
  phone?: string;
  /** IP del transporte, la arma el controlador desde req.ip; el cliente no la fija. */
  ipAddress?: string;
}

export class RegisterCaregiver {
  private readonly userRepository: UserRepositoryPort;
  private readonly passwordHasher: PasswordHasherPort;
  private readonly clock: Clock;
  private readonly termsVersion: string;

  constructor(deps: RegisterCaregiverDeps) {
    this.userRepository = deps.userRepository;
    this.passwordHasher = deps.passwordHasher;
    this.clock = deps.clock;
    this.termsVersion = deps.termsVersion;
  }

  /**
   * Valida todo el pedido antes de tocar el repositorio: un error de formato
   * no consulta ni escribe nada. El chequeo de duplicidad es la única llamada.
   */
  async execute(command: RegisterCaregiverCommand): Promise<StoredUser> {
    if (command.acceptedTerms !== true) {
      throw new AppError(
        400,
        'TERMS_NOT_ACCEPTED',
        'Debés aceptar la política de tratamiento de datos para crear la cuenta',
      );
    }
    const email = normalizeEmail(command.email);
    if (!isValidEmailFormat(email)) {
      throw new AppError(400, 'INVALID_EMAIL', 'El correo no es válido', { field: 'email' });
    }
    if (!isValidPassword(command.password)) {
      throw new AppError(
        400,
        'WEAK_PASSWORD',
        'La contraseña debe tener al menos 8 caracteres, con al menos una letra y un dígito',
        { field: 'password' },
      );
    }
    if (!isValidFullName(command.fullName)) {
      throw new AppError(
        400,
        'INVALID_BODY',
        'El nombre completo debe tener al menos 3 caracteres',
        { field: 'fullName' },
      );
    }
    if (command.phone !== undefined && !isValidPhone(command.phone)) {
      throw new AppError(400, 'INVALID_BODY', 'El teléfono no cumple el formato esperado', {
        field: 'phone',
      });
    }

    const existing = await this.userRepository.findByEmail(email);
    if (existing !== null) {
      throw new AppError(400, 'EMAIL_ALREADY_REGISTERED', 'Este correo ya tiene una cuenta');
    }

    const passwordHash = await this.passwordHasher.hash(command.password);
    const consent = createConsentEvidence({
      termsVersion: this.termsVersion,
      acceptedTermsAt: this.clock.now(),
      ...(command.ipAddress === undefined ? {} : { ipAddress: command.ipAddress }),
    });
    const user = User.create({
      email,
      passwordHash,
      fullName: collapseSpaces(command.fullName),
      ...(command.phone === undefined ? {} : { phone: command.phone }),
      consent,
    });
    return this.userRepository.save(user);
  }
}
