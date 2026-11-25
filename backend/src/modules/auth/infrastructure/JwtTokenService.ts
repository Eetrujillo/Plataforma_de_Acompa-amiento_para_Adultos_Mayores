import jwt from 'jsonwebtoken';
import type { SessionClaims } from '../domain/sessionClaims.ts';

/** Claims ya validados tras verificar la firma. */
export interface VerifiedSessionClaims {
  sub: string;
  email: string;
  role: string;
  sv: number;
}

/**
 * El único adaptador que firma y verifica tokens de sesión (D4, skill
 * jwt-security regla 1). Ningún controlador firma por su cuenta. HS256 fijo
 * con lista de permisos explícita: un token con `alg` cambiado no entra.
 */
export class JwtTokenService {
  private readonly secret: string;
  /** `JWT_EXPIRES_IN` (default `7d`); no hay refresh token. */
  private readonly expiresIn: jwt.SignOptions['expiresIn'];

  constructor(secret: string, expiresIn: string) {
    this.secret = secret;
    // @types/jsonwebtoken acota expiresIn a una plantilla literal (StringValue);
    // el valor es configuración de entorno, su validez la audita jsonwebtoken
    // al firmar. Un único cast documentado, sin `any`.
    this.expiresIn = expiresIn as jwt.SignOptions['expiresIn'];
  }

  sign(claims: SessionClaims): string {
    return jwt.sign({ email: claims.email, role: claims.role, sv: claims.sv }, this.secret, {
      subject: claims.sub,
      expiresIn: this.expiresIn,
    });
  }

  /**
   * Verifica firma, algoritmo y vigencia, y valida la forma de los claims.
   * Un token sin `sv` (emitido por versiones anteriores) se lee como 0.
   */
  verify(token: string): VerifiedSessionClaims {
    const payload = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new Error('El token no trae un payload de sesión');
    }
    const sub = payload['sub'];
    const email = payload['email'];
    const role = payload['role'];
    const sv = payload['sv'] === undefined ? 0 : payload['sv'];
    if (
      typeof sub !== 'string' ||
      sub === '' ||
      typeof email !== 'string' ||
      typeof role !== 'string' ||
      typeof sv !== 'number' ||
      !Number.isInteger(sv)
    ) {
      throw new Error('El token no trae claims de sesión válidos');
    }
    return { sub, email, role, sv };
  }
}
