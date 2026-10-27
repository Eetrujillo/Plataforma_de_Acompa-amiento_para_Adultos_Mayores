const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const {
  issueVerificationEmail,
  verifyEmailToken,
} = require('../services/verification.service');
const {
  consumePasswordResetToken,
  issuePasswordResetEmail,
} = require('../services/passwordReset.service');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*\p{L})(?=.*\d).{8,}$/u;
const PRIVACY_POLICY_VERSION = '1.0';

const EMAIL_INVALID_MESSAGE = 'Escribe un correo válido';
const PASSWORD_RULE_MESSAGE =
  'La contraseña debe tener mínimo 8 caracteres, con letras y números.';
const PRIVACY_REQUIRED_MESSAGE =
  'Debes aceptar la política de privacidad y el tratamiento de datos.';
const EMAIL_EXISTS_MESSAGE = 'Este correo ya tiene una cuenta';
const INVALID_CREDENTIALS_MESSAGE = 'Correo o contraseña incorrectos.';
const PASSWORD_RESET_REQUEST_MESSAGE =
  'Si existe una cuenta, te enviamos un enlace.';
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
// Hash de una contraseña ficticia con el mismo costo que las reales. Se usa
// para que un correo inexistente tarde un tiempo comparable a una contraseña
// incorrecta y no se pueda enumerar cuentas por temporización.
const DUMMY_PASSWORD_HASH = '$2b$12$gdd33wDGEjg8UDRlFKWe5eHh5fOtaYEiLcSvVMpRVs9Y364sVpyGK';

if (!process.env.JWT_SECRET) {
  console.warn('ADVERTENCIA: JWT_SECRET no está definido. Se usa un secreto solo para desarrollo.');
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      tokenVersion: Number(user.tokenVersion || 0),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function formatWait(seconds) {
  if (seconds < 60) {
    return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
  }

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes === 1 ? '' : 's'}`;
}

function lockedResponse(res, retryAfterSeconds) {
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({
    error: `Demasiados intentos fallidos. Inténtalo de nuevo en ${formatWait(retryAfterSeconds)}.`,
    code: 'LOGIN_LOCKED',
    retryAfterSeconds,
  });
}

function nameFromEmail(email) {
  const localPart = email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .trim();

  if (!localPart || localPart.length < 2) return 'Familiar';
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

function publicUser(user) {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt,
    privacyPolicy: user.privacyPolicy?.version
      ? {
          version: user.privacyPolicy.version,
          acceptedAt: user.privacyPolicy.acceptedAt,
        }
      : undefined,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const providedName = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const acceptPrivacyPolicy = req.body?.acceptPrivacyPolicy;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        error: EMAIL_INVALID_MESSAGE,
        code: 'INVALID_EMAIL',
      });
    }

    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        error: PASSWORD_RULE_MESSAGE,
        code: 'WEAK_PASSWORD',
      });
    }

    if (acceptPrivacyPolicy !== true) {
      return res.status(400).json({
        error: PRIVACY_REQUIRED_MESSAGE,
        code: 'PRIVACY_NOT_ACCEPTED',
      });
    }

    if (providedName && providedName.length < 2) {
      return res.status(400).json({
        error: 'El nombre debe tener al menos 2 caracteres.',
        code: 'INVALID_NAME',
      });
    }

    const existing = await User.exists({ email });
    if (existing) {
      return res.status(409).json({
        error: EMAIL_EXISTS_MESSAGE,
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    const user = await User.create({
      name: providedName || nameFromEmail(email),
      email,
      password,
      role: 'familiar',
      privacyPolicy: {
        version: PRIVACY_POLICY_VERSION,
        acceptedAt: new Date(),
      },
    });

    let emailVerificationSent = false;
    try {
      const result = await issueVerificationEmail(user);
      emailVerificationSent = result.sent;
    } catch (err) {
      // La cuenta ya fue creada; la página de verificación permite reenviar el enlace.
      console.error('No se pudo enviar el correo de confirmación:', err.message);
    }

    return res.status(201).json({
      token: signToken(user),
      user: publicUser(user),
      emailVerificationSent,
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({
        error: EMAIL_EXISTS_MESSAGE,
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    return next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    const user = await User.findOne({ email }).select(
      '+password +failedLoginAttempts +loginLockedUntil +tokenVersion'
    );

    // El mismo mensaje para correo inexistente y contraseña incorrecta evita
    // revelar si la cuenta está registrada. La comparación ficticia mantiene
    // un tiempo de respuesta similar al de una contraseña incorrecta.
    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    }

    const now = Date.now();
    let resetExpiredLock = false;

    if (user.loginLockedUntil && user.loginLockedUntil.getTime() > now) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((user.loginLockedUntil.getTime() - now) / 1000)
      );
      return lockedResponse(res, retryAfterSeconds);
    }

    if (user.loginLockedUntil && user.loginLockedUntil.getTime() <= now) {
      user.failedLoginAttempts = 0;
      user.loginLockedUntil = undefined;
      resetExpiredLock = true;
    }

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) {
      const attempts = Number(user.failedLoginAttempts || 0) + 1;
      user.failedLoginAttempts = attempts;

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        user.loginLockedUntil = new Date(Date.now() + LOGIN_LOCK_MS);
      }

      await user.save();

      if (user.loginLockedUntil) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 1000)
        );
        return lockedResponse(res, retryAfterSeconds);
      }

      return res.status(401).json({ error: INVALID_CREDENTIALS_MESSAGE });
    }

    if (resetExpiredLock || user.failedLoginAttempts > 0 || user.loginLockedUntil) {
      user.failedLoginAttempts = 0;
      user.loginLockedUntil = undefined;
      await user.save();
    }

    return res.json({
      token: signToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const result = await verifyEmailToken(token);

    if (result.status === 'verified') {
      return res.json({
        message: 'Tu correo fue confirmado correctamente.',
        code: 'EMAIL_VERIFIED',
      });
    }

    if (result.status === 'already_used') {
      return res.status(409).json({
        error: 'Este enlace ya fue utilizado. Tu correo ya está confirmado.',
        code: 'TOKEN_ALREADY_USED',
      });
    }

    if (result.status === 'expired') {
      return res.status(410).json({
        error: 'El enlace venció. Solicita uno nuevo.',
        code: 'TOKEN_EXPIRED',
      });
    }

    return res.status(400).json({
      error: 'El enlace no es válido o ya fue reemplazado. Solicita uno nuevo.',
      code: 'TOKEN_INVALID',
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        error: EMAIL_INVALID_MESSAGE,
        code: 'INVALID_EMAIL',
      });
    }

    const user = await User.findOne({ email });

    // No revelamos si el correo está registrado o no.
    if (!user) {
      return res.json({
        message: 'Si el correo está registrado, enviaremos un nuevo enlace de confirmación.',
        code: 'VERIFICATION_SENT',
      });
    }

    if (user.emailVerified) {
      return res.json({
        message: 'Tu correo ya está confirmado.',
        code: 'EMAIL_ALREADY_VERIFIED',
      });
    }

    const result = await issueVerificationEmail(user, { countRequest: true });

    if (result.rateLimited) {
      const seconds = result.retryAfterSeconds;

      res.set('Retry-After', String(seconds));
      return res.status(429).json({
        error: `Has alcanzado el límite de 3 enlaces por hora. Inténtalo de nuevo en ${formatWait(seconds)}.`,
        code: 'RESEND_RATE_LIMITED',
        retryAfterSeconds: seconds,
      });
    }

    if (result.alreadyVerified) {
      return res.json({
        message: 'Tu correo ya está confirmado.',
        code: 'EMAIL_ALREADY_VERIFIED',
      });
    }

    return res.json({
      message: 'Te enviamos un nuevo enlace de confirmación. Revisa tu correo.',
      code: 'VERIFICATION_SENT',
    });
  } catch (err) {
    if (err?.code === 'EMAIL_NOT_CONFIGURED') {
      return res.status(503).json({
        error: 'El servicio de correo no está configurado. Contacta al administrador.',
        code: 'EMAIL_NOT_CONFIGURED',
      });
    }

    console.error('No se pudo reenviar el correo de confirmación:', err.message);
    return res.status(502).json({
      error: 'No pudimos enviar el correo de confirmación. Inténtalo de nuevo más tarde.',
      code: 'EMAIL_SEND_FAILED',
    });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({
        error: EMAIL_INVALID_MESSAGE,
        code: 'INVALID_EMAIL',
      });
    }

    const user = await User.findOne({ email });

    // La respuesta es siempre la misma, exista o no la cuenta, y no espera al
    // envío del correo para no revelar la existencia de la cuenta por tiempo.
    if (user) {
      void issuePasswordResetEmail(user).catch((err) => {
        console.error('No se pudo enviar el correo de restablecimiento:', err.message);
      });
    }

    return res.json({
      message: PASSWORD_RESET_REQUEST_MESSAGE,
      code: 'PASSWORD_RESET_REQUESTED',
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');

    // Se valida antes de consumir el token: una contraseña débil no quema el enlace.
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        error: PASSWORD_RULE_MESSAGE,
        code: 'WEAK_PASSWORD',
      });
    }

    const result = await consumePasswordResetToken(token, password);

    if (result.status === 'reset') {
      return res.json({
        message: 'Tu contraseña fue actualizada. Inicia sesión con tu nueva contraseña.',
        code: 'PASSWORD_RESET',
      });
    }

    if (result.status === 'used') {
      return res.status(409).json({
        error: 'Este enlace ya fue utilizado. Solicita uno nuevo.',
        code: 'RESET_TOKEN_USED',
      });
    }

    if (result.status === 'expired') {
      return res.status(410).json({
        error: 'El enlace venció. Solicita uno nuevo.',
        code: 'RESET_TOKEN_EXPIRED',
      });
    }

    return res.status(400).json({
      error: 'El enlace no es válido. Solicita uno nuevo.',
      code: 'RESET_TOKEN_INVALID',
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

module.exports = router;
