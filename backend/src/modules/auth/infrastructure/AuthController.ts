import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../shared/errors/AppError.ts';
import { RegisterCaregiver } from '../application/RegisterCaregiver.ts';
import type { RegisterCaregiverCommand } from '../application/RegisterCaregiver.ts';

/**
 * Arma el comando desde el cuerpo crudo. Los campos que el cliente no puede
 * fijar (role, emailVerifiedAt, evidencia de consentimiento) se ignoran: la
 * evidencia la arma el servidor desde el reloj, TERMS_VERSION y req.ip.
 */
function buildCommand(body: unknown, ipAddress: string | undefined): RegisterCaregiverCommand {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'INVALID_BODY', 'El cuerpo del pedido no tiene el formato esperado');
  }
  const raw = body as Record<string, unknown>;
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

/** Controlador HTTP del registro (POST /api/auth/register). */
export function createAuthController(registerCaregiver: RegisterCaregiver) {
  return {
    // Express 4 no propaga los rechazos de handlers async: se capturan y se
    // delegan al errorHandler explícitamente.
    async register(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const command = buildCommand(req.body, req.ip);
        const user = await registerCaregiver.execute(command);
        // La respuesta no expone passwordHash ni campos de sesión (S9).
        res.status(201).json({
          user: {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
          },
        });
      } catch (error: unknown) {
        next(error);
      }
    },
  };
}
