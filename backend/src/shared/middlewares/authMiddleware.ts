import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../errors/AppError.ts';

export const MISSING_TOKEN_MESSAGE = 'Falta el token de sesión';
/** Un solo mensaje para token malformado, con secreto ajeno, vencido o con `sv` viejo (S10). */
export const INVALID_SESSION_MESSAGE = 'La sesión no es válida';

export interface SessionTokenVerifierPort {
  verify(token: string): { sub: string; email: string; role: string; sv: number };
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  sessionVersion: number | null;
}

export interface SessionUserReaderPort {
  findSessionUserById(id: string): Promise<SessionUser | null>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Lo fija el authMiddleware una sola vez por pedido. */
      sessionUser?: SessionUser;
    }
  }
}

/**
 * Único guard del backend (skill jwt-security regla 6): sin `Authorization:
 * Bearer <token>` válido no hay respuesta — S10, la ruta privada no se ejecuta.
 * Compara el claim `sv` contra `sessionVersion` del usuario (regla 8): subir la
 * versión cierra todas las sesiones. La búsqueda del usuario es de esta manera
 * el costo asumido por request.
 */
export function authMiddleware(deps: {
  verifier: SessionTokenVerifierPort;
  reader: SessionUserReaderPort;
}): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.headers['authorization'];
      // Esquema estricto: `Bearer <token>`. Cualquier otra forma cuenta como
      // "sin token" y responde el mismo mensaje que la ausencia del header.
      const token =
        typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
      if (token === null || token === '') {
        throw new AppError(401, 'UNAUTHORIZED', MISSING_TOKEN_MESSAGE);
      }
      let claims: { sub: string; email: string; role: string; sv: number };
      try {
        claims = deps.verifier.verify(token);
      } catch {
        throw new AppError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE);
      }
      const user = await deps.reader.findSessionUserById(claims.sub);
      if (user === null || (user.sessionVersion ?? 0) !== claims.sv) {
        throw new AppError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE);
      }
      req.sessionUser = user;
      next();
    } catch (error: unknown) {
      next(error);
    }
  };
}
