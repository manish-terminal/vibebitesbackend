const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: [true, 'Announcement message is required'],
      trim: true,
      maxlength: [200, 'Message cannot exceed 200 characters']
    },
    isActive: {
      type: Boolean,
      default: true
    },
    priority: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  {
    timestamps: true
  }
);

// Index for efficient queries
announcementSchema.index({ isActive: 1, priority: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);

