---
name: MERN Fullstack Change
description: Implement a full-stack change in this older-adult accompaniment platform. Use when adding or modifying an HU, API endpoint, model, service, route, frontend page, form, or type across the Express/MongoDB backend and React frontend.
---

# MERN Fullstack Change

Implement one HU end-to-end without breaking earlier HUs.

## Order of work

1. Read the HU and the existing implementation in `README.md`.
2. Define the contract first: method, path, auth, request body/query, response, error codes,
   validation limits. Add it to the frontend types only after the backend shape is fixed.
3. Backend:
   - Model: `backend/src/models/`.
   - Constants: `backend/src/constants/`.
   - Business logic + validation: `backend/src/services/` returning `{ status, ... }`.
   - HTTP mapping: `backend/src/routes/` (status + `code` + `field` when applicable).
   - Mount in `backend/src/index.js` with `requireAuth` + `requireVerifiedEmail` for family
     routes, or `requireOlderAdultSession` for app routes.
   - Scope every family query by `familiar: req.user._id`.
4. Frontend:
   - Types: `frontend/src/types/index.d.ts`.
   - API calls: `frontend/src/services/`.
   - Page/component + route in `frontend/src/routes/AppRoutes.tsx`.
   - Handle loading, empty, offline, `401`, validation `field`, and lock/retry states.
5. Docs/config: update `README.md`, `.env.example`, and `docker-compose.yml` when a new env var
   or endpoint is introduced.
6. Validate:
   ```bash
   cd backend && node --check src/index.js
   cd ../frontend && npm run typecheck && npm run build
   ```
   Add or run an isolated Node test when the logic can be tested without MongoDB.

## Project rules

- Preserve HU-001 to HU-015 behavior.
- Family routes use `Bearer` JWT; the older-adult app uses `X-Older-Adult-Token`.
- Never return `pinHash`, code/session hashes, or raw tokens.
- Senior screens (`/app`, `/app/vincular`, `/app/ajustes`) use `.senior-app`: base text 20 px,
  no text below `1em`, large controls, visible focus, high contrast.
- Use `ConfirmDialog.tsx` for confirmations; `Modal.tsx` is empty.
- Default time zone is `America/Bogota`.
- Keep Docker compatibility: no host-only paths, use env vars, bind to `0.0.0.0`.
- Do not commit, push, or deploy without explicit approval.

## Done checklist

- [ ] Route exists and is mounted.
- [ ] Auth middleware is correct for the actor.
- [ ] Validation matches the UI limits and messages.
- [ ] Response fields match the frontend type.
- [ ] Error `code`s are handled in the UI.
- [ ] README and env docs updated.
- [ ] `node --check`, typecheck, build, and relevant tests pass.
