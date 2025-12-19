const { v2: cloudinary } = require('cloudinary');
const { logger } = require('./logger');

let isConfigured = false;

const ensureCloudinaryConfigured = () => {
  if (isConfigured) {
    return cloudinary;
  }

  const {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET
  } = process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error(
      'Missing Cloudinary configuration. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.'
    );
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
  });

  isConfigured = true;
  logger.info('Cloudinary configured successfully');

  return cloudinary;
};

module.exports = {
  getCloudinary: ensureCloudinaryConfigured
};

