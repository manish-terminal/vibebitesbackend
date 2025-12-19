// Backend Implementation Example for your Express.js server
// Add this to your backend routes (e.g., routes/admin.js)

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/products/';
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

// Configure multer middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Image upload endpoint
router.post('/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No image file provided'
      });
    }

    // Get the uploaded file info
    const { filename, path: filePath, mimetype, size } = req.file;
    const isMainImage = req.body.isMainImage === 'true';
    
    // Construct the public URL for the uploaded image
    // Adjust this based on your server configuration
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/products/${filename}`;
    
    // Optionally save file info to database for tracking
    // const fileRecord = await FileModel.create({
    //   filename,
    //   originalName: req.file.originalname,
    //   path: filePath,
    //   url: imageUrl,
    //   mimetype,
    //   size,
    //   isMainImage,
    //   uploadedBy: req.user.id // if you have user authentication
    // });

    res.status(200).json({
      success: true,
      data: {
        imageUrl,
        filename,
        size,
        isMainImage
      },
      message: 'Image uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up uploaded file if there was an error
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading image'
    });
  }
});

// Serve static files (add this to your main app.js)
// app.use('/uploads', express.static('uploads'));

module.exports = router;

/*
Installation Requirements:
npm install multer

File Structure on Backend:
your-backend/
├── uploads/
│   └── products/
│       ├── image-1696118400000-123456789.jpg
│       └── image-1696118500000-987654321.png
├── routes/
│   └── admin.js (this file)
└── app.js (main server file)

Add to your main app.js:
app.use('/uploads', express.static('uploads'));
app.use('/api/admin', require('./routes/admin'));

Environment Variables (optional):
UPLOAD_DIR=uploads/products/
MAX_FILE_SIZE=5242880
*/