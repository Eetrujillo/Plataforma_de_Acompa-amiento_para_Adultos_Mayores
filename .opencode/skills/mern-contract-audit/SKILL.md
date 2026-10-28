---
name: MERN Contract Audit
description: Audit frontend service calls against Express routes in this MERN project. Use when a frontend change adds or modifies an API call, when checking that backend routes, auth, payloads, responses, validation, and error codes match the UI, or before closing an HU.
---

# MERN Contract Audit

Verify every frontend call has a backend route that accepts the same method, path, auth,
payload, validation, and response shape. Report mismatches before changing code.

## Workflow

1. List every call in `frontend/src/services/`:
   - `authService.ts`, `olderAdultService.ts`, `activityService.ts`, `olderAdultAppService.ts`.
   - Also search for direct `fetch(` and `apiClient.` usage.
2. List routes mounted in `backend/src/index.js` and defined in `backend/src/routes/`.
3. Compare one row per call using `references/contract-matrix.md`:
   - HTTP method and full path (`/api` is the frontend base).
   - Auth: family routes need `Bearer` JWT + verified email; app routes need
     `X-Older-Adult-Token`; public routes need neither.
   - Request body/query names and types.
   - Response fields actually read by the UI.
   - Error status + `code` handled by the UI.
4. Check validation parity against backend services:
   - Activity: title 1–60, icon enum, `YYYY-MM-DD`, `HH:mm`, repeat `once|daily|weekly`,
     weekly needs weekdays `0..6`, past date needs `confirmPast: true`.
   - Older adult: name 2–80, PIN exactly 4 digits, valid IANA time zone.
   - Linking code: `^[A-HJ-NP-Z2-9]{8}$` after removing separators.
   - Consent: current version from `backend/src/constants/consent.js`.
5. Fix only real mismatches. Keep the frontend type in `frontend/src/types/index.d.ts` and the
   backend response in sync.
6. Validate:
   ```bash
   cd backend && node --check src/index.js
   cd ../frontend && npm run typecheck && npm run build
   ```
   Run the isolated HU tests in `%TEMP%\opencode` when relevant.

## Rules

- Family data must always be scoped by `familiar: req.user._id`; other accounts get `404`.
- Never expose `pinHash`, link-code hashes, session hashes, or raw session tokens.
- A frontend `401` from a family route triggers the session-expired flow. Do not reuse that
  flow for the older-adult app token.
- Do not commit, push, or deploy without explicit approval.

## References

- `references/contract-matrix.md`: current endpoint and error-code matrix.
