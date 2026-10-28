import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ConsentContent } from '../../components/app/ConsentContent';
import { AppApiError, olderAdultAppService } from '../../services/olderAdultAppService';
import type { ConsentText } from '../../types';

const CODE_REGEX = /^[A-HJ-NP-Z2-9]{8}$/;

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
};

function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function formatCode(value: string): string {
  const normalized = normalizeCode(value);
  return normalized.length > 4
    ? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
    : normalized;
}

function extractCode(value: string): string {
  const match = /(?:codigo=|code=)([A-Za-z0-9-]+)/i.exec(value);
  return formatCode(match ? match[1] : value);
}

export function OlderAdultLinkPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { message?: string } | null;
  const [consent, setConsent] = useState<ConsentText | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(locationState?.message ?? '');
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false
  );
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function loadConsent() {
      try {
        const response = await olderAdultAppService.getConsent();
        if (!active) return;
        setConsent(response.consent);
        olderAdultAppService.saveConsentCache(response.consent);
      } catch {
        if (!active) return;
        const cached = olderAdultAppService.readConsentCache();
        if (cached) {
          setConsent(cached);
        } else {
          setError('Necesitas conexión a internet para vincular la app.');
        }
      } finally {
        if (active) setConsentLoading(false);
      }
    }

    void loadConsent();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!olderAdultAppService.hasToken()) return;

    olderAdultAppService
      .session()
      .then(() => navigate('/app', { replace: true }))
      .catch((err) => {
        if (err instanceof AppApiError && err.status === 401) {
          olderAdultAppService.clearToken();
        }
      });
  }, [navigate]);

  useEffect(() => {
    function handleOnline() {
      setOffline(false);
    }
    function handleOffline() {
      setOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;

    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  useEffect(() => {
    if (lockedUntil && nowTick >= lockedUntil) {
      setLockedUntil(null);
    }
  }, [lockedUntil, nowTick]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const remainingSeconds = lockedUntil
    ? Math.max(0, Math.ceil((lockedUntil - nowTick) / 1000))
    : 0;
  const locked = remainingSeconds > 0;

  function stopCamera() {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
  }

  async function startCamera() {
    setCameraError('');
    setError('');

    const BarcodeDetectorCtor = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;

    if (!navigator.mediaDevices?.getUserMedia || !BarcodeDetectorCtor) {
      setCameraError(
        'Tu navegador no puede escanear el QR. Puedes escribir el código que te dio tu familiar.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);

      window.setTimeout(async () => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;

        try {
          await videoRef.current.play();
        } catch {
          // La vista previa puede requerir un toque en algunos navegadores.
        }
      }, 0);

      const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });

      scanTimerRef.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;

        try {
          const results = await detector.detect(video);
          if (results.length > 0) {
            const detected = extractCode(results[0].rawValue);
            setCode(detected);
            setNotice('Código leído. Revisa que sea correcto y acepta el consentimiento.');
            stopCamera();
          }
        } catch {
          // Un fotograma sin QR no es un error.
        }
      }, 600);
    } catch {
      setCameraError('No pudimos usar la cámara. Puedes escribir el código.');
      stopCamera();
    }
  }

  async function refreshConsent() {
    try {
      const response = await olderAdultAppService.getConsent();
      setConsent(response.consent);
      olderAdultAppService.saveConsentCache(response.consent);
    } catch {
      // Se conserva el texto que ya estaba visible.
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (locked) return;

    if (!accepted) {
      setError('Debes aceptar el consentimiento para vincular la app.');
      return;
    }

    if (!consent) {
      setError('Necesitas conexión a internet para vincular la app.');
      return;
    }

    const normalized = normalizeCode(code);

    if (!CODE_REGEX.test(normalized)) {
      setError('Escribe el código completo de 8 caracteres.');
      return;
    }

    if (offline) {
      setError('Necesitas conexión a internet para vincular la app.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const response = await olderAdultAppService.redeem({
        code: formatCode(normalized),
        consentAccepted: true,
        consentVersion: consent.version,
      });

      // Evita mostrar la rutina guardada de un perfil anterior en este dispositivo.
      olderAdultAppService.clearRoutineCache();
      olderAdultAppService.setToken(response.sessionToken);
      navigate('/app', { replace: true });
    } catch (err) {
      if (err instanceof AppApiError) {
        if (err.code === 'LINK_ATTEMPTS_LOCKED') {
          const seconds = err.retryAfterSeconds ?? 15 * 60;
          setLockedUntil(Date.now() + seconds * 1000);
          setNowTick(Date.now());
          setError(err.message);
        } else if (
          err.code === 'LINK_CODE_INVALID' ||
          err.code === 'LINK_CODE_EXPIRED' ||
          err.code === 'LINK_CODE_USED'
        ) {
          setError('Pídele a tu familiar un código nuevo.');
        } else if (err.code === 'CONSENT_VERSION_OUTDATED') {
          setAccepted(false);
          setError(err.message);
          await refreshConsent();
        } else {
          setError(err.message);
        }
      } else {
        setError('No pudimos vincular la app. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleReject() {
    setAccepted(false);
    setNotice('');
    setError(consent?.rejectMessage ?? 'No se compartirá nada.');
  }

  return (
    <main className="senior-app">
      <div className="senior-shell">
        <header className="senior-header">
          <div>
            <p className="senior-eyebrow">App del adulto mayor</p>
            <h1>Vincular mi app</h1>
            <p>Escribe o escanea el código que te dio tu familiar.</p>
          </div>
          <Link className="senior-link" to="/login">
            Soy familiar
          </Link>
        </header>

        {offline ? (
          <div className="senior-notice" role="status">
            Sin internet. Necesitas conexión para vincular la app.
          </div>
        ) : null}

        {error ? (
          <div className="senior-error" role="alert">
            {error}
          </div>
        ) : null}

        {notice ? (
          <div className="senior-notice" role="status">
            {notice}
          </div>
        ) : null}

        <section className="senior-card">
          <h2>1. Escribe el código</h2>
          <p>El código tiene 8 letras y números, por ejemplo: ABCD-2345.</p>

          <form className="senior-form" onSubmit={handleSubmit} noValidate>
            <label className="senior-label" htmlFor="link-code">
              Código de vinculación
            </label>
            <input
              id="link-code"
              className="senior-input senior-code-input"
              value={code}
              onChange={(event) => {
                const value = event.target.value;
                setCode(
                  /(?:codigo=|code=)/i.test(value) ? extractCode(value) : formatCode(value)
                );
                setError('');
              }}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="one-time-code"
              placeholder="ABCD-2345"
              maxLength={120}
              disabled={locked || submitting}
            />

            <div className="senior-camera-actions">
              <button
                className="senior-btn senior-btn-secondary"
                type="button"
                onClick={() => {
                  if (cameraActive) stopCamera();
                  else void startCamera();
                }}
                disabled={submitting}
              >
                {cameraActive ? 'Detener cámara' : 'Escanear el QR con la cámara'}
              </button>
            </div>

            {cameraError ? (
              <p className="senior-inline-error" role="alert">
                {cameraError}
              </p>
            ) : null}

            {cameraActive ? (
              <video
                ref={videoRef}
                className="senior-camera"
                muted
                playsInline
                aria-label="Vista de la cámara para escanear el código QR"
              />
            ) : null}

            <h2>2. Lee y acepta el consentimiento</h2>

            {consentLoading ? (
              <p>Cargando el consentimiento…</p>
            ) : consent ? (
              <>
                <ConsentContent consent={consent} />

                <label className="senior-checkbox-row" htmlFor="accept-consent">
                  <input
                    id="accept-consent"
                    className="senior-checkbox"
                    type="checkbox"
                    checked={accepted}
                    onChange={(event) => {
                      setAccepted(event.target.checked);
                      setError('');
                    }}
                    disabled={locked || submitting}
                  />
                  <span>{consent.acceptLabel}</span>
                </label>
              </>
            ) : (
              <p>Necesitas conexión a internet para leer el consentimiento.</p>
            )}

            {locked ? (
              <div className="senior-notice" role="status">
                No puedes intentar de nuevo por {Math.ceil(remainingSeconds / 60)} minuto(s).
              </div>
            ) : null}

            <div className="senior-form-actions">
              <button
                className="senior-btn senior-btn-primary"
                type="submit"
                disabled={locked || submitting || !consent || !accepted}
              >
                {submitting ? 'Vinculando…' : 'Acepto y quiero vincular mi app'}
              </button>
              <button
                className="senior-btn senior-btn-secondary"
                type="button"
                onClick={handleReject}
                disabled={submitting}
              >
                No acepto
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
