import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../shared/errors/AppError.ts';
import { RegisterCaregiver } from '../application/RegisterCaregiver.ts';
import type { RegisterCaregiverCommand } from '../application/RegisterCaregiver.ts';
import { ConfirmEmail } from '../application/ConfirmEmail.ts';
import { RequestEmailVerification } from '../application/RequestEmailVerification.ts';

/**
 * La evidencia de la Ley 1581 no puede guardar lo que el cliente escriba en un
 * header: con proxies confiables de más, `req.ip` puede traer texto arbitrario.
 * Sólo se registra cuando es una dirección IP válida.
 */
function evidenceIp(raw: string | undefined): string | undefined {
  const candidate = raw?.trim();
  if (candidate === undefined || candidate === '') return undefined;
  return isIP(candidate) === 0 ? undefined : candidate;
}

/**
 * Arma el comando desde el cuerpo crudo. Los campos que el cliente no puede
 * fijar (role, emailVerifiedAt, evidencia de consentimiento) se ignoran: la
 * evidencia la arma el servidor desde el reloj, TERMS_VERSION y req.ip.
 */
function buildRegisterCommand(
  body: unknown,
  ipAddress: string | undefined,
): RegisterCaregiverCommand {
  const raw = bodyObject(body);
  const fullName = raw['fullName'];
  const email = raw['email'];
  const password = raw['password'];
  if (typeof fullName !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    throw new AppError(400, 'INVALID_BODY', 'El cuerpo del pedido no tiene el formato esperado', {
      field: 'body',
    });
  }
  const command: RegisterCaregiverCommand = {
    fullName,
    email,
    password,
    acceptedTerms: raw['acceptedTerms'] === true,
  };
  if (raw['phone'] !== undefined) {
    if (typeof raw['phone'] !== 'string') {
      throw new AppError(400, 'INVALID_BODY', 'El teléfono debe ser texto', { field: 'phone' });
    }
    command.phone = raw['phone'];
  }
  if (ipAddress !== undefined) {
    command.ipAddress = ipAddress;
  }
  return command;
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_BODY', 'El cuerpo del pedido no tiene el formato esperado');
  }
  return body as Record<string, unknown>;
}

/** `token` y `email` llegan como texto; cualquier otra cosa es INVALID_BODY. */
function requiredString(body: unknown, field: string): string {
  const raw = bodyObject(body);
  const value = raw[field];
  if (typeof value !== 'string') {
    throw new AppError(400, 'INVALID_BODY', 'El cuerpo del pedido no tiene el formato esperado', {
      field: 'body',
    });
  }
  return value;
}

export interface AuthUseCases {
  registerCaregiver: RegisterCaregiver;
  requestEmailVerification: RequestEmailVerification;
  confirmEmail: ConfirmEmail;
}

/** Controlador HTTP del módulo auth (HU-001 y HU-002). */
export function createAuthController(useCases: AuthUseCases) {
  return {
    // Express 4 no propaga los rechazos de handlers async: se capturan y se
    // delegan al errorHandler explícitamente.
    async register(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const command = buildRegisterCommand(req.body, evidenceIp(req.ip));
        const result = await useCases.registerCaregiver.execute(command);
        // La respuesta no expone passwordHash ni campos de sesión (S9 de HU-001);
        // HU-002 suma el booleano verificationSent (docs/smtp-setup.md:143,158).
        res.status(201).json({
          user: {
            id: result.user.id,
            email: result.user.email,
            fullName: result.user.fullName,
            role: result.user.role,
          },
          verificationSent: result.verificationSent,
        });
      } catch (error: unknown) {
        next(error);
      }
    },

    async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const token = requiredString(req.body, 'token');
        const user = await useCases.confirmEmail.execute(token);
        // D1: la verificación no emite sesión — el JWT es HU-003 (login).
        res.status(200).json({
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            emailVerified: true,
          },
        });
      } catch (error: unknown) {
        next(error);
      }
    },

    async resendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const email = requiredString(req.body, 'email');
        await useCases.requestEmailVerification.resend(email);
        // Anti-oráculo (S7): idéntico exista o no la cuenta y esté o no verificada.
        res.status(202).json({ accepted: true });
      } catch (error: unknown) {
        next(error);
      }
    },
  };
}
