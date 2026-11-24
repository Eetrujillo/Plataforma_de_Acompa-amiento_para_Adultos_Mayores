/**
 * Error operativo: cruza el límite hacia el cliente con el sobre exacto de
 * docs/error-handling.md. Cualquier otro error se enmascara como 500.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /** `details` aparece solo cuando el error lo trae cargado (validación campo por campo). */
  readonly details?: Record<string, string>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
