import { useEffect, useRef, useState } from 'react';

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_ID = 'google-identity-services';

/**
 * Loads Google Identity Services once per page.
 *
 * The promise is cached so a remount (or a re-render) never injects the script twice.
 */
let loadPromise = null;

function loadGoogleScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('no window'));
  }

  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google);
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID);

    if (existing) {
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', () => reject(new Error('google script failed')));
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('google script failed'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Google sign-in button.
 *
 * The client id arrives at runtime from `GET /api/auth/google/config`, so the same
 * bundle works locally and on the server without rebuilding with a different env.
 * Google returns an id_token; the backend is the one that decides whether the
 * account exists.
 */
export function GoogleSignInButton({ clientId, onCredential, disabled = false }) {
  const containerRef = useRef(null);
  const [unavailable, setUnavailable] = useState(false);
  const credentialHandler = useRef(onCredential);

  credentialHandler.current = onCredential;

  useEffect(() => {
    if (!clientId) {
      return undefined;
    }

    let cancelled = false;

    loadGoogleScript()
      .then((google) => {
        if (cancelled || !containerRef.current || !google?.accounts?.id) {
          return;
        }

        google.accounts.id.initialize({
          client_id: clientId,
          // Popup mode: the login screen has no separate redirect route.
          ux_mode: 'popup',
          callback: (response) => {
            if (response?.credential) {
              credentialHandler.current?.(response.credential);
            }
          }
        });

        const width = Math.max(200, Math.round(containerRef.current.getBoundingClientRect().width));

        google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          logo_alignment: 'left',
          width
        });
      })
      .catch(() => {
        if (!cancelled) {
          setUnavailable(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!clientId) {
    return null;
  }

  return (
    <div className="login__google-button" role="group" aria-label="Continuar con Google">
      {unavailable ? (
        <p className="login__google-fallback" role="alert">
          No pudimos cargar Google. Revisá tu conexión o ingresá con tu contraseña.
        </p>
      ) : (
        <div ref={containerRef} className={disabled ? 'login__google-mount is-disabled' : 'login__google-mount'} />
      )}
    </div>
  );
}
