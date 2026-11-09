import { useCallback, useState } from 'react';

import { triggerSos } from '../infrastructure/sosHttpAdapter.js';

const GEOLOCATION_OPTIONS = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 };

function readPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Este dispositivo no puede obtener la ubicación GPS.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (geoError) => {
        const denied = geoError?.code === 1;
        reject(
          new Error(
            denied
              ? 'Necesitamos permiso de ubicación para enviar la alerta. Activalo en los ajustes del teléfono.'
              : 'No pudimos obtener tu ubicación. Probá al aire libre o encendé el GPS y reintentá.'
          )
        );
      },
      GEOLOCATION_OPTIONS
    );
  });
}

/**
 * Owns the SOS action: locate, send, and expose a readable state machine.
 */
export function useSosAlert() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);

  const trigger = useCallback(async (message) => {
    setStatus('locating');
    setError(null);

    try {
      const coordinates = await readPosition();
      setStatus('sending');
      const created = await triggerSos({ ...coordinates, message });
      setAlert(created);
      setStatus('sent');
      return true;
    } catch (caught) {
      setError(caught.message);
      setStatus('error');
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setAlert(null);
  }, []);

  return { status, error, alert, trigger, reset };
}
