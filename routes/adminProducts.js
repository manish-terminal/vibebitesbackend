const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect, admin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const Product = require('../models/Product');
const { logger } = require('../utils/logger');
const { uploadProductImages, getFileUrl, makeSingleUploader } = require('../middleware/upload');
const router = express.Router();
const Category = require('../models/Category');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Get product by ID (Admin)
router.get('/:id', protect, admin, asyncHandler(async (req, res) => {
  console.log('ADMIN GET PRODUCT BY ID:', req.params.id);
  const product = await Product.findById(req.params.id);
  console.log('ADMIN PRODUCT QUERY RESULT:', product);
  if (!product) {
    console.log('ADMIN PRODUCT NOT FOUND:', req.params.id);
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, data: { product } });
}))

// Update product by ID (Admin)
router.put('/:id', protect, admin, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name 2-100 chars'),
  body('description').trim().isLength({ min: 0, max: 2000 }).withMessage('Description max 2000 chars'),
  body('category').notEmpty().withMessage('Category required'),
  body('image').notEmpty().withMessage('Main image is required'),
  body('sizes').isArray({ min: 1 }).withMessage('At least one size required'),
  body('sizes.*.size').notEmpty().withMessage('Size label required'),
  body('sizes.*.price').isFloat({ min: 0 }).withMessage('Price must be >= 0'),
  body('sizes.*.stock').isInt({ min: 0 }).withMessage('Stock must be >= 0'),
  body('ingredients').notEmpty().withMessage('Ingredients required'),
  body('nutrition.calories').notEmpty().withMessage('Calories required'),
  body('nutrition.protein').notEmpty().withMessage('Protein required'),
  body('nutrition.carbs').notEmpty().withMessage('Carbs required'),
  body('nutrition.fat').notEmpty().withMessage('Fat required'),
  body('nutrition.fiber').notEmpty().withMessage('Fiber required'),
  body('youtubeVideo').optional().isString().isLength({ max: 300 }).withMessage('YouTube video link too long'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() })
  }
  // Validate category against Category collection
  const categoryName = req.body.category
  const categoryDoc = await Category.findOne({ name: categoryName, isActive: true })
  if (!categoryDoc) {
    return res.status(400).json({ success: false, message: 'Invalid category' })
  }
  const product = await Product.findById(req.params.id)
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' })
  }
  Object.assign(product, { ...req.body, category: categoryDoc.name })
  await product.save()
  res.json({ success: true, message: 'Product updated', data: { product } })
}))

// Create a full product (Admin) - both root and /create routes for compatibility
router.post('/', protect, admin, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name 2-100 chars'),
  body('description').trim().isLength({ min: 0, max: 2000 }).withMessage('Description max 2000 chars'),
  body('category').notEmpty().withMessage('Category required'),
  body('image').notEmpty().withMessage('Main image is required'),
  body('sizes').isArray({ min: 1 }).withMessage('At least one size required'),
  body('sizes.*.size').notEmpty().withMessage('Size label required'),
  body('sizes.*.price').isFloat({ min: 0 }).withMessage('Price must be >= 0'),
  body('sizes.*.stock').isInt({ min: 0 }).withMessage('Stock must be >= 0'),
  body('ingredients').notEmpty().withMessage('Ingredients required'),
  body('nutrition.calories').notEmpty().withMessage('Calories required'),
  body('nutrition.protein').notEmpty().withMessage('Protein required'),
  body('nutrition.carbs').notEmpty().withMessage('Carbs required'),
  body('nutrition.fat').notEmpty().withMessage('Fat required'),
  body('nutrition.fiber').notEmpty().withMessage('Fiber required'),
  body('youtubeVideo').optional().isString().isLength({ max: 300 }).withMessage('YouTube video link too long'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  // Validate category against Category collection
  const categoryName = req.body.category;
  const categoryDoc = await Category.findOne({ name: categoryName, isActive: true });
  if (!categoryDoc) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }
  try {
    const product = await Product.create({ ...req.body, category: categoryDoc.name });
    res.status(201).json({ success: true, message: 'Product created', data: { product } });
  } catch (e) {
    logger.error('Admin product create error:', e);
    res.status(500).json({ success: false, message: 'Error creating product' });
  }
}));

// Create a full product (Admin) - /create route for frontend compatibility
router.post('/create', protect, admin, uploadProductImages, asyncHandler(async (req, res) => {
  try {
    console.log('Create product request body:', req.body);
    console.log('Create product files:', req.files);
    
    // Parse JSON fields if they come as strings (from FormData)
    let productData = { ...req.body };
    
    if (typeof productData.sizes === 'string') {
      try {
        productData.sizes = JSON.parse(productData.sizes);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid sizes format' });
      }
    }
    
    if (typeof productData.images === 'string') {
      try {
        productData.images = JSON.parse(productData.images);
      } catch (e) {
        productData.images = [];
      }
    }
    
    if (typeof productData.nutrition === 'string') {
      try {
        productData.nutrition = JSON.parse(productData.nutrition);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Invalid nutrition format' });
      }
    }
    
    // Handle file uploads
    if (req.files) {
      // Handle main image
      if (req.files.image && req.files.image[0]) {
        const mainImageUrl = getFileUrl(req, req.files.image[0].filename, 'products');
        productData.image = mainImageUrl;
      }
      
      // Handle additional images - they come as 'images' array
      if (req.files.images && req.files.images.length > 0) {
        const additionalImageUrls = req.files.images.map(file => getFileUrl(req, file.filename, 'products'));
        productData.images = [...(productData.images || []), ...additionalImageUrls].filter(Boolean);
      }
    }
    
    // Validation
    const errors = [];
    if (!productData.name || productData.name.trim().length < 2) errors.push({ msg: 'Name must be at least 2 characters' });
    // Allow any length (including empty) for description
    if (!productData.category) errors.push({ msg: 'Category is required' });
    if (!productData.image) errors.push({ msg: 'Main image is required' });
    if (!productData.ingredients || !productData.ingredients.trim()) errors.push({ msg: 'Ingredients are required' });
    
    if (!productData.sizes || !Array.isArray(productData.sizes) || productData.sizes.length === 0) {
      errors.push({ msg: 'At least one size is required' });
    } else {
      productData.sizes.forEach((size, index) => {
        if (!size.size || !size.size.trim()) errors.push({ msg: `Size label is required for size #${index + 1}` });
        if (size.price === undefined || size.price === '' || isNaN(parseFloat(size.price)) || parseFloat(size.price) < 0) {
          errors.push({ msg: `Valid price is required for size #${index + 1}` });
        }
        if (size.stock === undefined || size.stock === '' || isNaN(parseInt(size.stock)) || parseInt(size.stock) < 0) {
          errors.push({ msg: `Valid stock is required for size #${index + 1}` });
        }
      });
    }
    
    if (!productData.nutrition || typeof productData.nutrition !== 'object') {
      errors.push({ msg: 'Nutrition information is required' });
    } else {
      const requiredNutrition = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
      requiredNutrition.forEach(field => {
        if (!productData.nutrition[field]) errors.push({ msg: `${field} is required in nutrition` });
      });
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }
    
    // Validate category against Category collection
    const categoryDoc = await Category.findOne({ name: productData.category, isActive: true });
    if (!categoryDoc) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }
    
    // Process sizes data
    productData.sizes = productData.sizes.map(size => ({
      size: size.size.trim(),
      price: parseFloat(size.price),
      stock: parseInt(size.stock)
    }));
    
    // Filter out empty images
    if (productData.images) {
      productData.images = productData.images.filter(img => img && img.trim());
    }
    
    // Create the product
    const product = await Product.create({
      ...productData,
      category: categoryDoc.name,
      video: productData.video || ''
    });
    
    logger.info(`Product created successfully: ${product._id}`);
    res.status(201).json({ success: true, message: 'Product created successfully', data: { product } });
    
  } catch (error) {
    logger.error('Product creation error:', error);
    res.status(500).json({ success: false, message: 'Error creating product: ' + error.message });
  }
}));

// Upload product image endpoint
router.post('/upload', protect, admin, makeSingleUploader('products', 'image'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const imageUrl = getFileUrl(req, req.file.filename, 'products');
    
    res.json({ 
      success: true, 
      message: 'Image uploaded successfully',
      data: { imageUrl }
    });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Upload failed' 
    });
  }
}));

module.exports = router;
