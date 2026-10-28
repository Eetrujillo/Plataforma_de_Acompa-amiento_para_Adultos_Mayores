const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio.'],
      trim: true,
      minlength: [2, 'El nombre debe tener al menos 2 caracteres.'],
      maxlength: [80, 'El nombre no puede superar los 80 caracteres.'],
    },
    email: {
      type: String,
      required: [true, 'El correo electrónico es obligatorio.'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Escribe un correo válido'],
    },
    password: {
      type: String,
      required: [true, 'La contraseña es obligatoria.'],
      minlength: [8, 'La contraseña debe tener al menos 8 caracteres.'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'teacher', 'student', 'familiar'],
        message: 'El rol indicado no es válido.',
      },
      default: 'familiar',
    },
    privacyPolicy: {
      version: {
        type: String,
        trim: true,
      },
      acceptedAt: {
        type: Date,
      },
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifiedAt: {
      type: Date,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    loginLockedUntil: {
      type: Date,
      select: false,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      select: false,
    },
    passwordResetTokenUsedAt: {
      type: Date,
      select: false,
    },
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },
    emailVerificationExpiresAt: {
      type: Date,
      select: false,
    },
    emailVerificationTokenUsedAt: {
      type: Date,
      select: false,
    },
    emailVerificationRequests: {
      type: [Date],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.index({ emailVerificationTokenHash: 1 }, { sparse: true });
userSchema.index({ passwordResetTokenHash: 1 }, { sparse: true });

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.__v;
    delete ret.emailVerificationTokenHash;
    delete ret.emailVerificationExpiresAt;
    delete ret.emailVerificationTokenUsedAt;
    delete ret.emailVerificationRequests;
    delete ret.failedLoginAttempts;
    delete ret.loginLockedUntil;
    delete ret.tokenVersion;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpiresAt;
    delete ret.passwordResetTokenUsedAt;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
