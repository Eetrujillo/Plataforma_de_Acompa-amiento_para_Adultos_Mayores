const mongoose = require('mongoose');
const { ACTIVITY_ICON_KEYS, REPEAT_TYPES } = require('../constants/activity');

const activitySchema = new mongoose.Schema(
  {
    familiar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    olderAdult: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OlderAdult',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'El título es obligatorio.'],
      trim: true,
      maxlength: [60, 'El título no puede superar los 60 caracteres.'],
    },
    icon: {
      type: String,
      enum: {
        values: ACTIVITY_ICON_KEYS,
        message: 'El ícono no es válido.',
      },
      required: [true, 'El ícono es obligatorio.'],
    },
    scheduledAt: {
      type: Date,
      required: [true, 'La fecha y hora son obligatorias.'],
    },
    timeZone: {
      type: String,
      required: true,
    },
    repeatType: {
      type: String,
      enum: {
        values: REPEAT_TYPES,
        message: 'La repetición no es válida.',
      },
      default: 'once',
    },
    weekdays: {
      type: [Number],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

activitySchema.index({ familiar: 1, createdAt: -1 });
activitySchema.index({ olderAdult: 1, active: 1, scheduledAt: 1 });

module.exports = mongoose.model('Activity', activitySchema);
