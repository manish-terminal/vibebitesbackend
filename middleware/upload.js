const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getCloudinary } = require('../utils/cloudinary');
const { logger } = require('../utils/logger');

// Ensure uploads directory exists (legacy fallback)
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

// Memory storage for Cloudinary upload
const storage = multer.memoryStorage();

// Configure upload limits and options
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 5 // max 5 files
  },
  fileFilter: fileFilter
});

// Helper to upload buffer to Cloudinary
const uploadBufferToCloudinary = (buffer, folder, filename) => {
  return new Promise((resolve, reject) => {
    const cloudinary = getCloudinary();
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `vibe-bites/${folder}`,
        public_id: filename ? path.parse(filename).name : undefined,
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

// Middleware to automatically upload files to Cloudinary
const autoUploadToCloudinary = (subdir) => {
  return async (req, res, next) => {
    try {
      if (!req.file && (!req.files || (Array.isArray(req.files) && req.files.length === 0) || (typeof req.files === 'object' && Object.keys(req.files).length === 0))) {
        return next();
      }

      // Handle single file
      if (req.file) {
        const result = await uploadBufferToCloudinary(req.file.buffer, subdir, req.file.originalname);
        req.file.filename = result.secure_url; // Use Cloudinary URL as filename
        req.file.path = result.secure_url;     // Use Cloudinary URL as path
        logger.info(`Uploaded ${req.file.originalname} to Cloudinary: ${result.secure_url}`);
      }

      // Handle file array
      if (Array.isArray(req.files)) {
        await Promise.all(req.files.map(async (file) => {
          const result = await uploadBufferToCloudinary(file.buffer, subdir, file.originalname);
          file.filename = result.secure_url;
          file.path = result.secure_url;
          logger.info(`Uploaded ${file.originalname} to Cloudinary: ${result.secure_url}`);
        }));
      }

      // Handle fields (object of arrays)
      if (req.files && !Array.isArray(req.files)) {
        const fields = Object.values(req.files);
        for (const fieldFiles of fields) {
          await Promise.all(fieldFiles.map(async (file) => {
            const result = await uploadBufferToCloudinary(file.buffer, subdir, file.originalname);
            file.filename = result.secure_url;
            file.path = result.secure_url;
            logger.info(`Uploaded ${file.originalname} to Cloudinary: ${result.secure_url}`);
          }));
        }
      }

      next();
    } catch (error) {
      logger.error('Cloudinary validation/upload error:', error);
      res.status(500).json({ success: false, message: 'Image upload failed: ' + error.message });
    }
  };
};

// Error handling wrapper
const handleUploadError = (uploadFn) => {
  return (req, res, next) => {
    uploadFn(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 5MB.'
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum is 5 files.'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Upload error: ' + err.message
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }
      next();
    });
  };
};

// Generate file URL - modified to support full Cloudinary URLs
const getFileUrl = (req, filename, subdir = 'products') => {
  if (!filename) return '';

  // If it's already a full URL (Cloudinary), return it
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename;
  }

  // Fallback for legacy local files
  try {
    const forwardedProto = req.get && (req.get('x-forwarded-proto') || req.get('X-Forwarded-Proto'));
    const forwardedHost = req.get && (req.get('x-forwarded-host') || req.get('X-Forwarded-Host'));
    const protocol = forwardedProto || (req.protocol || 'http');
    const host = forwardedHost || (req.get && req.get('host'));
    const baseUrlEnv = process.env.BASE_URL;
    const baseUrl = (protocol && host) ? `${protocol}://${host}` : (baseUrlEnv || 'http://localhost:3000');
    return `${baseUrl}/uploads/${subdir}/${filename}`;
  } catch (_) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/uploads/${subdir}/${filename}`;
  }
};

// Create custom uploaders (now memory based)
const createUploader = (subdir) => multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  },
  fileFilter
});

// Memory-based uploader
const createMemoryUploader = () => multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },
  fileFilter
});

const makeSingleUploader = (subdir, fieldName = 'image') => {
  const u = createUploader(subdir).single(fieldName);
  return [handleUploadError(u), autoUploadToCloudinary(subdir)];
};

const makeMemorySingleUploader = (fieldName = 'image') => {
  const u = createMemoryUploader().single(fieldName);
  return handleUploadError(u);
};

// Single image upload (default to products)
const uploadSingle = [handleUploadError(upload.single('image')), autoUploadToCloudinary('products')];

// Multiple images upload (default to products)
const uploadMultiple = [handleUploadError(upload.array('images', 5)), autoUploadToCloudinary('products')];

// Product images upload (main + additional)
const uploadProductImages = [
  handleUploadError(upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 4 },
    { name: 'mainImageFile', maxCount: 1 },
    { name: 'additionalImageFile_0', maxCount: 1 },
    { name: 'additionalImageFile_1', maxCount: 1 },
    { name: 'additionalImageFile_2', maxCount: 1 },
    { name: 'additionalImageFile_3', maxCount: 1 }
  ])),
  autoUploadToCloudinary('products')
];

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadProductImages,
  getFileUrl,
  handleUploadError,
  makeSingleUploader,
  createUploader,
  createMemoryUploader,
  makeMemorySingleUploader
};
