const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { protect, admin } = require('../middleware/auth');

// @route   GET /api/announcements/active
// @desc    Get all active announcements (public)
// @access  Public
router.get('/active', async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .sort({ priority: -1, createdAt: -1 })
      .select('message priority')
      .limit(10);

    res.json({
      success: true,
      count: announcements.length,
      data: announcements
    });
  } catch (error) {
    console.error('Get active announcements error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcements'
    });
  }
});

// @route   GET /api/announcements
// @desc    Get all announcements (admin only)
// @access  Private/Admin
router.get('/', protect, admin, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ priority: -1, createdAt: -1 });

    res.json({
      success: true,
      count: announcements.length,
      data: announcements
    });
  } catch (error) {
    console.error('Get all announcements error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcements'
    });
  }
});

// @route   GET /api/announcements/:id
// @desc    Get single announcement (admin only)
// @access  Private/Admin
router.get('/:id', protect, admin, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      data: announcement
    });
  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch announcement'
    });
  }
});

// @route   POST /api/announcements
// @desc    Create new announcement (admin only)
// @access  Private/Admin
router.post('/', protect, admin, async (req, res) => {
  try {
    const { message, isActive, priority } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Announcement message is required'
      });
    }

    const announcement = await Announcement.create({
      message: message.trim(),
      isActive: isActive !== undefined ? isActive : true,
      priority: priority !== undefined ? priority : 0
    });

    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create announcement'
    });
  }
});

// @route   PUT /api/announcements/:id
// @desc    Update announcement (admin only)
// @access  Private/Admin
router.put('/:id', protect, admin, async (req, res) => {
  try {
    const { message, isActive, priority } = req.body;

    let announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    // Update fields
    if (message !== undefined) announcement.message = message.trim();
    if (isActive !== undefined) announcement.isActive = isActive;
    if (priority !== undefined) announcement.priority = priority;

    await announcement.save();

    res.json({
      success: true,
      message: 'Announcement updated successfully',
      data: announcement
    });
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update announcement'
    });
  }
});

// @route   DELETE /api/announcements/:id
// @desc    Delete announcement (admin only)
// @access  Private/Admin
router.delete('/:id', protect, admin, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    await announcement.deleteOne();

    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete announcement'
    });
  }
});

module.exports = router;

