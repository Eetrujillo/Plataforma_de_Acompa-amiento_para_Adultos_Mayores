# Email-verified registration and login

Adds the missing email verification to the existing auth slice. Branch: `prod`
(working tree already deployed via `dev-Esteban-Trujillo`).

## Specs

S1. `POST /api/auth/register` creates the caregiver with `emailVerifiedAt = null` and sends a
verification email. The HTTP response never contains the token.
S2. The verification link is `${APP_URL}/verify-email?token=<raw>`; the token is 32 random bytes
(hex) and only its SHA-256 hash is stored. Single use, 24h TTL.
S3. Without `SMTP_HOST` the link is printed to the backend console (development fallback) and the
delivery is still reported as accepted.
S4. `POST /api/auth/login` rejects an unverified account with HTTP 403, code `EMAIL_NOT_VERIFIED`,
message `Tenés que verificar tu correo antes de ingresar.`
S5. `POST /api/auth/verify-email { token }` consumes the token, marks `emailVerifiedAt`, and returns
`{ token, user }` so the user lands logged in.
S6. `POST /api/auth/resend-verification { email }` always answers 202 (no user enumeration), and only
sends when there is an unverified caregiver with that email; it invalidates the previous token.
S7. Seniors created through pairing have no mailbox: they are created already verified.
S8. Frontend: `/register` form (email, full name, password, phone), `/verify-email` screen that
consumes `?token=`, and the login screen links to register and offers resend when the account is
unverified.
S9. Env keys reuse the previous implementation's names: `APP_URL`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Documented in `env.sample`.

## Tasks

| ID | Specs | Route | Commit |
|----|-------|-------|--------|
| T1 | S1,S2,S7 | inline | this commit |
| T2 | S3,S4,S5,S6,S9 | inline | this commit |
| T3 | S9 | inline | this commit |
| T4 | S8 | inline | this commit |
| T5 | all | inline | verified, see L5 |

## Log

L1 (user, verbatim):

> ahora ncesito que crees el incio de sesion y el registro funcional con la verificacion de el correo

L2 (evidence). The previous implementation (`92610e8`) already used nodemailer with
`SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS/SMTP_FROM` and `APP_URL`, and printed the link
to the console when SMTP was absent. Those exact names are reused so the VPS `.env` keeps working.

L3 (decision). Login is blocked until the email is verified: otherwise verification is decorative.
Seniors are exempt (S7) because pairing is their credential and they have no mailbox.

L4 (decision). Delegation was attempted and refused twice: `gentle-ai-worker` could not bootstrap
because the parent session root is `/home/kali`, not the repository. The unit was implemented inline
and the fallback is reported to the human.

L5 (evidence, observed):
- `backend: npm run build` -> `Generated Prisma Client (v6.19.3)`.
- `backend: npm test` -> 28 tests, 28 pass, 0 fail (10 new: token format/hash/expiry, register sends
  one email and leaves the account unverified, duplicate email rejected, login blocked with
  `EMAIL_NOT_VERIFIED` then allowed after verification, single-use token, malformed token, resend
  invalidates the previous link, resend reveals nothing for unknown/verified emails).
- `frontend: npm run build` -> 120+ modules, exit 0; import audit 0 broken.
- Not run: a real SMTP delivery (no credentials available) and `prisma db push` on Mongo.
