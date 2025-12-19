const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();
// Client pseudo-ID mapping endpoint (development)
if (process.env.NODE_ENV !== 'production') {
  router.post('/map-client-ids', async (req, res) => {
    try {
      const { ids = [] } = req.body;
      const products = await Product.find({ name: { $in: ids.map(i => new RegExp(i.replace(/[0-9]+$/, ''), 'i')) } })
        .select('name _id');
      res.json({ success: true, data: { products } });
    } catch (e) {
      res.status(500).json({ success: false, message: 'Mapping failed' });
    }
  });
}

// @route   GET /api/products
// @desc    Get all products with filtering and pagination
// @access  Public
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('category').optional().isIn(['Makhana', 'Chips', 'Bites', 'Nuts', 'Seeds']).withMessage('Invalid category'),
  query('featured').optional().isBoolean().withMessage('Featured must be a boolean'),
  query('search').optional().trim(),
  query('minPrice').optional().isFloat({ min: 0 }).withMessage('Min price must be a positive number'),
  query('maxPrice').optional().isFloat({ min: 0 }).withMessage('Max price must be a positive number'),
  query('sort').optional().isIn(['name', 'price', 'rating', 'createdAt']).withMessage('Invalid sort field'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('Order must be asc or desc')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const {
    page = 1,
    limit = 12,
    category,
    featured,
    search,
    minPrice,
    maxPrice,
    sort = 'createdAt',
    order = 'desc'
  } = req.query;

  // Build filter object
  const filter = { isActive: true };

  if (category) filter.category = category;
  if (featured !== undefined) filter.featured = featured === 'true';

  // Price filter
  if (minPrice || maxPrice) {
    filter['sizes.price'] = {};
    if (minPrice) filter['sizes.price'].$gte = parseFloat(minPrice);
    if (maxPrice) filter['sizes.price'].$lte = parseFloat(maxPrice);
  }

  // Search functionality
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
      { ingredients: { $regex: search, $options: 'i' } },
      { 'tags': { $regex: search, $options: 'i' } }
    ];
  }

  // Build sort object
  const sortObj = {};
  sortObj[sort] = order === 'asc' ? 1 : -1;

  // Calculate pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    // Get products with pagination
    const products = await Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');

    // Build base URL for normalizing image paths
    const forwardedProto = req.get('x-forwarded-proto') || req.get('X-Forwarded-Proto');
    const forwardedHost = req.get('x-forwarded-host') || req.get('X-Forwarded-Host');
    const protocol = forwardedProto || req.protocol || 'http';
    const host = forwardedHost || req.get('host');
    const fallbackBase = process.env.BASE_URL || 'http://localhost:3000';
    const baseUrl = (protocol && host) ? `${protocol}://${host}` : fallbackBase;

    // Normalize product image URLs so they work on any device/host
    const normalizedProducts = products.map(p => {
      const product = p.toObject ? p.toObject() : p;
      let mainImage = product.image || '';
      if (mainImage) {
        if (mainImage.startsWith('/uploads/')) {
          mainImage = `${baseUrl}${mainImage}`;
        }
        mainImage = mainImage
          .replace(/^https?:\/\/localhost:3000/, baseUrl)
          .replace(/^https?:\/\/snacks-back01\.onrender\.com/, baseUrl);
      }
      let images = Array.isArray(product.images) ? product.images.slice() : [];
      images = images.map(img => {
        if (!img) return img;
        let out = img;
        if (out.startsWith('/uploads/')) {
          out = `${baseUrl}${out}`;
        }
        return out
          .replace(/^https?:\/\/localhost:3000/, baseUrl)
          .replace(/^https?:\/\/snacks-back01\.onrender\.com/, baseUrl);
      });
      return { ...product, image: mainImage, images };
    });

    // Get total count for pagination
    const total = await Product.countDocuments(filter);

    // Calculate pagination info
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    res.json({
      success: true,
      data: {
        products: normalizedProducts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: total,
          itemsPerPage: parseInt(limit),
          hasNextPage,
          hasPrevPage
        }
      }
    });
  } catch (error) {
    logger.error('Product fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching products'
    });
  }
}));

// @route   GET /api/products/featured
// @desc    Get featured products
// @access  Public
router.get('/featured', asyncHandler(async (req, res) => {
  const products = await Product.find({ featured: true, isActive: true })
    .sort({ createdAt: -1 })
    .limit(6)
    .select('-__v');

  // Build base URL for normalizing image paths
  const forwardedProto = req.get('x-forwarded-proto') || req.get('X-Forwarded-Proto');
  const forwardedHost = req.get('x-forwarded-host') || req.get('X-Forwarded-Host');
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host');
  const fallbackBase = process.env.BASE_URL || 'http://localhost:3000';
  const baseUrl = (protocol && host) ? `${protocol}://${host}` : fallbackBase;

  const normalizedProducts = products.map(p => {
    const product = p.toObject ? p.toObject() : p;
    let mainImage = product.image || '';
    if (mainImage) {
      if (mainImage.startsWith('/uploads/')) {
        mainImage = `${baseUrl}${mainImage}`;
      }
      mainImage = mainImage
        .replace(/^https?:\/\/localhost:3000/, baseUrl)
        .replace(/^https?:\/\/snacks-back01\.onrender\.com/, baseUrl);
    }
    let images = Array.isArray(product.images) ? product.images.slice() : [];
    images = images.map(img => {
      if (!img) return img;
      let out = img;
      if (out.startsWith('/uploads/')) {
        out = `${baseUrl}${out}`;
      }
      return out
        .replace(/^https?:\/\/localhost:3000/, baseUrl)
        .replace(/^https?:\/\/snacks-back01\.onrender\.com/, baseUrl);
    });
    return { ...product, image: mainImage, images };
  });

  res.json({
    success: true,
    data: { products: normalizedProducts }
  });
}));

// @route   GET /api/products/categories
// @desc    Get all categories with product counts
// @access  Public
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = await Product.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        minPrice: { $min: { $min: '$sizes.price' } },
        maxPrice: { $max: { $max: '$sizes.price' } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.json({
    success: true,
    data: { categories }
  });
}));

// @route   GET /api/products/:id
// @desc    Get single product by ID
// @access  Public

router.get('/:id', asyncHandler(async (req, res) => {
  logger.info(`[DEBUG] GET /api/products/:id called with id: ${req.params.id}`);
  const product = await Product.findOne({ 
    _id: req.params.id, 
    isActive: true 
  }).select('-__v');
  logger.info(`[DEBUG] Product query result: ${JSON.stringify(product)}`);

  if (!product) {
    logger.warn(`[DEBUG] Product not found for id: ${req.params.id}`);
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Build base URL for normalizing image paths
  const forwardedProto = req.get('x-forwarded-proto') || req.get('X-Forwarded-Proto');
  const forwardedHost = req.get('x-forwarded-host') || req.get('X-Forwarded-Host');
  const protocol = forwardedProto || req.protocol || 'http';
  const host = forwardedHost || req.get('host');
  const fallbackBase = process.env.BASE_URL || 'http://localhost:3000';
  const baseUrl = (protocol && host) ? `${protocol}://${host}` : fallbackBase;

  const productObj = product.toObject ? product.toObject() : product;
  let mainImage = productObj.image || '';
  if (mainImage) {
    if (mainImage.startsWith('/uploads/')) {
      mainImage = `${baseUrl}${mainImage}`;
    }
    mainImage = mainImage.replace(/^https?:\/\/localhost:3000/, baseUrl);
  }
  let images = Array.isArray(productObj.images) ? productObj.images.slice() : [];
  images = images.map(img => {
    if (!img) return img;
    let out = img;
    if (out.startsWith('/uploads/')) {
      out = `${baseUrl}${out}`;
    }
    return out.replace(/^https?:\/\/localhost:3000/, baseUrl);
  });

  res.json({
    success: true,
    data: { product: { ...productObj, image: mainImage, images } }
  });
}));

// @route   POST /api/products
// @desc    Create a new product (Admin only)
// @access  Private/Admin
router.post('/', protect, admin, [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Product name must be between 2 and 100 characters'),
  body('description')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .isIn(['Makhana', 'Chips', 'Bites', 'Nuts', 'Seeds'])
    .withMessage('Invalid category'),
  body('image')
    .notEmpty()
    .withMessage('Product image is required'),
  body('sizes')
    .isArray({ min: 1 })
    .withMessage('At least one size is required'),
  body('sizes.*.size')
    .notEmpty()
    .withMessage('Size is required'),
  body('sizes.*.price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('sizes.*.stock')
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer'),
  body('ingredients')
    .notEmpty()
    .withMessage('Ingredients are required'),
  body('nutrition.calories')
    .notEmpty()
    .withMessage('Calories are required'),
  body('nutrition.protein')
    .notEmpty()
    .withMessage('Protein is required'),
  body('nutrition.carbs')
    .notEmpty()
    .withMessage('Carbs are required'),
  body('nutrition.fat')
    .notEmpty()
    .withMessage('Fat is required'),
  body('nutrition.fiber')
    .notEmpty()
    .withMessage('Fiber is required')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const product = await Product.create(req.body);

  res.status(201).json({
    success: true,
    message: 'Product created successfully',
    data: { product }
  });
}));

// @route   PUT /api/products/:id
// @desc    Update a product (Admin only)
// @access  Private/Admin
router.put('/:id', protect, admin, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Product name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Description must be between 10 and 1000 characters'),
  body('category')
    .optional()
    .isIn(['Makhana', 'Chips', 'Bites', 'Nuts', 'Seeds'])
    .withMessage('Invalid category')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).select('-__v');

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  res.json({
    success: true,
    message: 'Product updated successfully',
    data: { product }
  });
}));

// @route   DELETE /api/products/:id
// @desc    Delete a product (Admin only)
// @access  Private/Admin
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  res.json({
    success: true,
    message: 'Product deleted successfully'
  });
}));

// @route   PUT /api/products/:id/stock
// @desc    Update product stock (Admin only)
// @access  Private/Admin
router.put('/:id/stock', protect, admin, [
  body('size')
    .notEmpty()
    .withMessage('Size is required'),
  body('quantity')
    .isInt({ min: 0 })
    .withMessage('Quantity must be a non-negative integer')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { size, quantity } = req.body;

  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Find and update the specific size
  const sizeIndex = product.sizes.findIndex(s => s.size === size);
  if (sizeIndex === -1) {
    return res.status(400).json({
      success: false,
      message: 'Size not found for this product'
    });
  }

  product.sizes[sizeIndex].stock = quantity;
  product.inStock = product.sizes.some(s => s.stock > 0);
  await product.save();

  res.json({
    success: true,
    message: 'Stock updated successfully',
    data: { product }
  });
}));

module.exports = router; 