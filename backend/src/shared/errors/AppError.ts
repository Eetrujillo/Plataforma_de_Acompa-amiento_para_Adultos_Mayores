/**
 * Error operativo: cruza el límite hacia el cliente con el sobre exacto de
 * docs/error-handling.md. Cualquier otro error se enmascara como 500.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /**
   * `details` aparece solo cuando el error lo trae cargado. `unknown` porque
   * no todo detail es texto: el 429 del reenvío lleva `retryAfterSeconds`
   * numérico (docs/auth-api.md, HU-002).
   */
  readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
