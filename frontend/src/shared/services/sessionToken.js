const STORAGE_KEY = 'acompanamiento.session';

function readFrom(store) {
  try {
    const raw = store.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function removeFrom(store) {
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: an unreachable store means there is no session to drop.
  }
}

/**
 * Session survives a browser restart when persisted in localStorage, or only
 * this tab when stored in sessionStorage (the "Recordarme" flag).
 *
 * A session persisted by older versions of the app lives only in localStorage;
 * reading sessionStorage first and falling back to localStorage keeps it valid.
 */
export function readSession() {
  return readFrom(window.sessionStorage) ?? readFrom(window.localStorage);
}

export function writeSession(session, { persist = true } = {}) {
  const primary = persist ? window.localStorage : window.sessionStorage;
  const secondary = persist ? window.sessionStorage : window.localStorage;

  // Drop the copy in the other store so the next read resolves the fresh session.
  removeFrom(secondary);

  try {
    primary.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private mode or full quota: the app keeps working for this page view.
  }
}

export function clearSession() {
  removeFrom(window.sessionStorage);
  removeFrom(window.localStorage);
}
