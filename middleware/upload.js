const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
const productsDir = path.join(uploadsDir, 'products');
const bannersDir = path.join(uploadsDir, 'banners');
const categoriesDir = path.join(uploadsDir, 'categories');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(productsDir)) {
  fs.mkdirSync(productsDir, { recursive: true });
}
if (!fs.existsSync(bannersDir)) {
  fs.mkdirSync(bannersDir, { recursive: true });
}
if (!fs.existsSync(categoriesDir)) {
  fs.mkdirSync(categoriesDir, { recursive: true });
}

// Factory: configure multer for a given subdirectory under /uploads
const makeStorageFor = (subdir) => multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = path.join(uploadsDir, subdir || 'products');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

// Configure upload limits and options
const upload = multer({
  storage: makeStorageFor('products'),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 5 // max 5 files
  },
  fileFilter: fileFilter
});

// Single image upload
const uploadSingle = upload.single('image');

// Multiple images upload
const uploadMultiple = upload.array('images', 5);

// Product images upload (main + additional)
const uploadProductImages = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 4 },
  { name: 'mainImageFile', maxCount: 1 },
  { name: 'additionalImageFile_0', maxCount: 1 },
  { name: 'additionalImageFile_1', maxCount: 1 },
  { name: 'additionalImageFile_2', maxCount: 1 },
  { name: 'additionalImageFile_3', maxCount: 1 }
]);

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

// Generate file URL using the incoming request host/protocol (works behind proxies)
const getFileUrl = (req, filename, subdir = 'products') => {
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

// Create custom uploaders
const createUploader = (subdir) => multer({
  storage: makeStorageFor(subdir),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  },
  fileFilter
});

// Memory-based uploader (useful for piping to Cloudinary)
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
  return handleUploadError(u);
};

const makeMemorySingleUploader = (fieldName = 'image') => {
  const u = createMemoryUploader().single(fieldName);
  return handleUploadError(u);
};

module.exports = {
  upload,
  uploadSingle: handleUploadError(uploadSingle),
  uploadMultiple: handleUploadError(uploadMultiple),
  uploadProductImages: handleUploadError(uploadProductImages),
  getFileUrl,
  handleUploadError,
  // new exports for dynamic subdirectories
  makeSingleUploader,
  createUploader,
  createMemoryUploader,
  makeMemorySingleUploader
};
