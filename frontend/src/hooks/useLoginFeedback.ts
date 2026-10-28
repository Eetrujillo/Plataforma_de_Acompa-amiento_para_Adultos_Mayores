import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/apiClient';

export function useLoginFeedback() {
  const [error, setError] = useState('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [lockedEmail, setLockedEmail] = useState('');
  const hadLockoutRef = useRef(false);

  useEffect(() => {
    if (retryAfterSeconds <= 0) {
      if (hadLockoutRef.current) {
        hadLockoutRef.current = false;
        setError('');
        setLockedEmail('');
      }
      return undefined;
    }

    hadLockoutRef.current = true;
    const timer = window.setTimeout(() => {
      setRetryAfterSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds]);

  const reportError = useCallback((err: unknown, email: string) => {
    if (err instanceof ApiError) {
      setError(err.message);

      if (err.retryAfterSeconds) {
        setRetryAfterSeconds(err.retryAfterSeconds);
        setLockedEmail(email.trim().toLowerCase());
      } else {
        setRetryAfterSeconds(0);
        setLockedEmail('');
      }
      return;
    }

    setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
    setRetryAfterSeconds(0);
    setLockedEmail('');
  }, []);

  const clearError = useCallback(() => {
    setError('');
    setRetryAfterSeconds(0);
    setLockedEmail('');
  }, []);

  return {
    error,
    retryAfterSeconds,
    lockedEmail,
    reportError,
    clearError,
  };
}
