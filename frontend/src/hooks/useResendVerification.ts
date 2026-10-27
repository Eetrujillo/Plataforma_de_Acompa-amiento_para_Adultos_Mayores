import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../services/apiClient';
import { authService } from '../services/authService';
import type { ResendVerificationResponse } from '../types';

export function useResendVerification() {
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setRetryAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const resend = useCallback(
    async (email: string): Promise<ResendVerificationResponse | null> => {
      setResending(true);
      setMessage('');
      setError('');

      try {
        const response = await authService.resendVerification(email);
        setMessage(response.message);
        setRetryAfterSeconds(0);
        return response;
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.retryAfterSeconds) {
            setRetryAfterSeconds(err.retryAfterSeconds);
          }
          setError(err.message);
        } else {
          setError('No pudimos enviar el correo. Inténtalo de nuevo.');
        }
        return null;
      } finally {
        setResending(false);
      }
    },
    []
  );

  return {
    resend,
    resending,
    message,
    error,
    retryAfterSeconds,
  };
}
