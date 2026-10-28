const mongoose = require('mongoose');

const activityCompletionSchema = new mongoose.Schema(
  {
    activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Activity',
      required: true,
    },
    olderAdult: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'OlderAdult',
      required: true,
    },
    occurrenceDate: {
      type: String,
      required: true,
    },
    completedAt: {
      type: Date,
      required: true,
    },
    snapshot: {
      title: { type: String, required: true },
      icon: { type: String, required: true },
      time: { type: String, required: true },
      timeZone: { type: String, required: true },
      repeatSummary: { type: String, required: true },
    },
  },
  { timestamps: true }
);

activityCompletionSchema.index(
  { activity: 1, occurrenceDate: 1 },
  { unique: true }
);
activityCompletionSchema.index({ olderAdult: 1, occurrenceDate: 1 });

module.exports = mongoose.model('ActivityCompletion', activityCompletionSchema);
