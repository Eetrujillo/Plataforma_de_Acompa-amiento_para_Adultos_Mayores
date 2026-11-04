import { Capacitor } from '@capacitor/core';

/**
 * True when the bundle runs inside the Capacitor native shell (Android/iOS).
 */
export const IS_NATIVE_PLATFORM = Capacitor.isNativePlatform();

export const PLATFORM = Capacitor.getPlatform();

/**
 * Default landing route per runtime: the senior sees their routines on a phone,
 * the caregiver sees the dashboard on the web.
 */
export const DEFAULT_ROUTE = IS_NATIVE_PLATFORM ? '/senior' : '/caregiver';

/**
 * API origin.
 *
 * Web builds talk to `/api` (nginx or the Vite dev proxy forwards it), which
 * keeps the bundle origin-agnostic. Native builds cannot proxy, so they need an
 * absolute URL: set `VITE_API_URL=http://<IP_VPS>:3500/api` at build time.
 */
export const API_BASE_URL = import.meta.env.VITE_API_URL || (IS_NATIVE_PLATFORM ? 'http://localhost:3500/api' : '/api');

/**
 * Version of the data treatment policy shown in the sign-up consent.
 *
 * It is display only: the backend stamps `termsVersion` from its own `TERMS_VERSION`,
 * and that value is the audit evidence. Keep both in sync when the policy changes.
 */
export const TERMS_VERSION = import.meta.env.VITE_TERMS_VERSION || '1.0';
