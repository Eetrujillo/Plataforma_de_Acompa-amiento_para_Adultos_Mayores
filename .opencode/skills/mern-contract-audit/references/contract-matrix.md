# Contract matrix (HU-006 to HU-015)

Base URL: `/api`. Frontend types: `frontend/src/types/index.d.ts`.

## Auth (`/api/auth`)

| Method | Path | Auth | Body | Main response |
|---|---|---|---|---|
| POST | `/auth/register` | public | `name?`, `email`, `password`, `acceptPrivacyPolicy` | `token`, `user`, `emailVerificationSent` |
| POST | `/auth/login` | public | `email`, `password` | `token`, `user` |
| GET | `/auth/me` | Bearer | — | `User` |
| POST | `/auth/verify-email` | public | `token` | `message`, `code: EMAIL_VERIFIED` |
| POST | `/auth/resend-verification` | public | `email` | `message`, `code`, `retryAfterSeconds?` |
| POST | `/auth/forgot-password` | public | `email` | `message`, `code` |
| POST | `/auth/reset-password` | public | `token`, `password` | `message`, `code: PASSWORD_RESET` |

## Family older adults (`/api/older-adults`, Bearer + verified email)

| Method | Path | Body | Main response |
|---|---|---|---|
| GET | `/older-adults` | — | `olderAdults[]` |
| POST | `/older-adults` | `name`, `pin`, `timeZone` | `olderAdult`, `message` |
| GET | `/older-adults/:id` | — | `olderAdult` |
| PUT | `/older-adults/:id` | `name`, `pin?`, `timeZone` | `olderAdult`, `message` |
| POST | `/older-adults/:id/linking-code` | `{}` | `olderAdult`, `linkingCode`, `message` |
| POST | `/older-adults/:id/unlink` | `{}` | `olderAdult`, `message` |

`linkingCode`: `code` (`XXXX-XXXX`), `expiresAt`, `qrPayload`, `qrDataUrl`.

## Public linking (`/api/linking`)

| Method | Path | Body | Main response |
|---|---|---|---|
| POST | `/linking/redeem` | `code`, `consentAccepted`, `consentVersion` | `olderAdult`, `consent`, `sessionToken`, `message` |

Codes: `LINK_CODE_REQUIRED` 400, `LINK_CODE_INVALID` 400, `LINK_CODE_EXPIRED` 410,
`LINK_CODE_USED` 409, `CONSENT_REQUIRED` 400, `CONSENT_VERSION_OUTDATED` 409,
`LINK_ATTEMPTS_LOCKED` 429.

## Older-adult app (`/api/app`)

| Method | Path | Auth | Body/query | Main response |
|---|---|---|---|---|
| GET | `/app/consent` | public | — | `consent` text |
| GET | `/app/session` | app token | — | `olderAdult`, `consent` state |
| POST | `/app/consent` | app token | `consentVersion`, `accepted` | `message`, `consent` |
| POST | `/app/logout` | app token | `pin` | `message`, `code` |
| GET | `/app/activities` | app token + consent | `?date=YYYY-MM-DD` | `olderAdult`, `date`, `timeZone`, `activities[]` |
| POST | `/app/activities/:id/complete` | app token + consent | `date` | `message`, `completion` |
| DELETE | `/app/activities/:id/complete` | app token + consent | `?date=YYYY-MM-DD` | `message`, `code` |

App token header: `X-Older-Adult-Token`. Codes: `OLDER_ADULT_SESSION_REQUIRED` 401,
`OLDER_ADULT_SESSION_INVALID` 401, `CONSENT_VERSION_OUTDATED` 403,
`PIN_INVALID` 401, `PIN_ATTEMPTS_LOCKED` 429, `ACTIVITY_NOT_FOUND` 404,
`ACTIVITY_NOT_OCCURRED` 400, `ACTIVITY_DATE_INVALID` 400.

## Family activities (`/api/activities`, Bearer + verified email)

| Method | Path | Body/query | Main response |
|---|---|---|---|
| GET | `/activities` | `?olderAdultId=` | `activities[]` |
| POST | `/activities` | `olderAdultId`, `title`, `icon`, `date`, `time`, `repeatType`, `weekdays?`, `confirmPast?` | `activity`, `message` |
| GET | `/activities/:id` | — | `activity` |
| PUT | `/activities/:id` | `title`, `icon`, `date`, `time`, `repeatType`, `weekdays?`, `confirmPast?` | `activity`, `message` |
| DELETE | `/activities/:id` | — | `activity`, `message` |

Codes: `ACTIVITY_TITLE_REQUIRED`, `ACTIVITY_TITLE_TOO_LONG`, `ACTIVITY_ICON_REQUIRED`,
`ACTIVITY_ICON_INVALID`, `ACTIVITY_DATE_REQUIRED`, `ACTIVITY_TIME_REQUIRED`,
`ACTIVITY_DATE_TIME_INVALID`, `ACTIVITY_REPEAT_INVALID`, `ACTIVITY_WEEKDAYS_REQUIRED`
(400, with `field`); `ACTIVITY_PAST_REQUIRES_CONFIRMATION` (409, `requiresConfirmation`);
`ACTIVITY_NOT_FOUND` and `OLDER_ADULT_NOT_FOUND` (404).
