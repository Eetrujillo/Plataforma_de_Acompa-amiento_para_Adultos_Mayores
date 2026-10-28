const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DEFAULT_TIME_ZONE = 'America/Bogota';

const olderAdultSchema = new mongoose.Schema(
  {
    familiar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'El familiar propietario es obligatorio.'],
    },
    name: {
      type: String,
      required: [true, 'El nombre es obligatorio.'],
      trim: true,
      minlength: [2, 'El nombre debe tener al menos 2 caracteres.'],
      maxlength: [80, 'El nombre no puede superar los 80 caracteres.'],
    },
    pinHash: {
      type: String,
      required: [true, 'El PIN es obligatorio.'],
      select: false,
    },
    timeZone: {
      type: String,
      required: [true, 'La zona horaria es obligatoria.'],
      default: DEFAULT_TIME_ZONE,
      trim: true,
    },
    linkStatus: {
      type: String,
      enum: {
        values: ['pending', 'linked'],
        message: 'El estado de vinculación no es válido.',
      },
      default: 'pending',
    },
    linkedAt: {
      type: Date,
    },
    linkCodeHash: {
      type: String,
      select: false,
    },
    linkCodeCreatedAt: {
      type: Date,
      select: false,
    },
    linkCodeExpiresAt: {
      type: Date,
      select: false,
    },
    linkCodeUsedAt: {
      type: Date,
      select: false,
    },
    consent: {
      version: { type: String },
      acceptedAt: { type: Date },
    },
    appSessionHash: {
      type: String,
      select: false,
    },
    appSessionCreatedAt: {
      type: Date,
      select: false,
    },
    appSessionLastSeenAt: {
      type: Date,
      select: false,
    },
    appSessionExpiresAt: {
      type: Date,
      select: false,
    },
    pinFailedAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    pinLockedUntil: {
      type: Date,
      select: false,
    },
  },
  { timestamps: true }
);

olderAdultSchema.index({ familiar: 1, createdAt: -1 });
olderAdultSchema.index({ linkCodeHash: 1 }, { unique: true, sparse: true });
olderAdultSchema.index({ appSessionHash: 1 }, { unique: true, sparse: true });

olderAdultSchema.methods.comparePin = function comparePin(candidate) {
  return bcrypt.compare(candidate, this.pinHash);
};

olderAdultSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.pinHash;
    delete ret.linkCodeHash;
    delete ret.linkCodeCreatedAt;
    delete ret.linkCodeExpiresAt;
    delete ret.linkCodeUsedAt;
    delete ret.appSessionHash;
    delete ret.appSessionCreatedAt;
    delete ret.appSessionLastSeenAt;
    delete ret.appSessionExpiresAt;
    delete ret.pinFailedAttempts;
    delete ret.pinLockedUntil;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('OlderAdult', olderAdultSchema);
module.exports.DEFAULT_TIME_ZONE = DEFAULT_TIME_ZONE;
