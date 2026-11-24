import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.ts';

/** Traduce errores del body-parser al contrato de docs/error-handling.md. */
function translateBodyParserError(err: unknown): AppError | null {
  if (err === null || typeof err !== 'object' || !('type' in err)) return null;
  const type = (err as { type?: unknown }).type;
  if (type === 'entity.parse.failed') {
    return new AppError(400, 'INVALID_JSON', 'El cuerpo no es JSON válido');
  }
  if (type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo supera el límite de 100kb');
  }
  return null;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const translated = translateBodyParserError(err);
  if (translated !== null) {
    res.status(translated.statusCode).json({
      error: { code: translated.code, message: translated.message },
    });
    return;
  }
  if (err instanceof AppError) {
    // Los 4xx operativos no se loguean como error y no agregan requestId.
    const body: {
      error: { code: string; message: string; details?: Record<string, unknown> };
    } = {
      error: { code: err.code, message: err.message },
    };
    if (err.details !== undefined) body.error.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }
  // Error no operativo (Mongoose, driver, bug): se enmascara y se loguea con stack.
  const internal = new AppError(500, 'INTERNAL_ERROR', 'Unexpected server error');
  console.error('[error]', {
    status: internal.statusCode,
    code: internal.code,
    error: err instanceof Error ? err : new Error(String(err)),
  });
  res.status(internal.statusCode).json({
    error: { code: internal.code, message: internal.message },
  });
}
