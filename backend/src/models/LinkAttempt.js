const mongoose = require('mongoose');

const linkAttemptSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedUntil: {
      type: Date,
      default: null,
    },
    lastAttemptAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LinkAttempt', linkAttemptSchema);
