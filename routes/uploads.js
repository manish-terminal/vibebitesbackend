const express = require('express');
const { protect, admin } = require('../middleware/auth');
const { logger } = require('../utils/logger');
const { makeMemorySingleUploader } = require('../middleware/upload');
const { getCloudinary } = require('../utils/cloudinary');

const router = express.Router();

// Helper to stream upload to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'vibe-bites/banners') => {
  return new Promise((resolve, reject) => {
    try {
      const cloudinary = getCloudinary();
      const stream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
      stream.end(fileBuffer);
    } catch (err) {
      reject(err);
    }
  });
};

// POST /api/uploads/banner - upload a single banner image to Cloudinary
router.post('/banner', protect, admin, makeMemorySingleUploader('image'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'No image file provided' });
    }

    const result = await uploadToCloudinary(req.file.buffer, 'vibe-bites/banners');
    logger.info(`Banner image uploaded to Cloudinary: ${result.public_id}`);

    res.json({
      success: true,
      data: {
        imageUrl: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        format: result.format
      }
    });
  } catch (e) {
    logger.error('Banner upload failed:', e);
    res.status(500).json({ success: false, message: e.message || 'Upload failed' });
  }
});

module.exports = router;


