const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// In-memory cart storage (in production, use Redis or database)
const userCarts = new Map();

// @route   GET /api/cart
// @desc    Get user's cart
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const cart = userCarts.get(req.user._id.toString()) || { items: [], appliedCoupon: null };
  
  res.json({
    success: true,
    data: { cart }
  });
}));

// @route   POST /api/cart/add
// @desc    Add item to cart
// @access  Private
router.post('/add', protect, [
  body('productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  body('size')
    .notEmpty()
    .withMessage('Size is required'),
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { productId, size, quantity } = req.body;
  const userId = req.user._id.toString();

  // Get or create user cart
  let cart = userCarts.get(userId);
  if (!cart) {
    cart = { items: [], appliedCoupon: null };
  }

  // Check if item already exists in cart
  const existingItemIndex = cart.items.findIndex(
    item => item.productId === productId && item.size === size
  );

  if (existingItemIndex > -1) {
    // Update quantity
    cart.items[existingItemIndex].quantity += quantity;
  } else {
    // Add new item (in real app, fetch product details from database)
    cart.items.push({
      productId,
      size,
      quantity,
      // These would come from database in real implementation
      name: 'Product Name',
      price: 100,
      image: '/images/product.jpg',
      category: 'Makhana'
    });
  }

  // Save cart
  userCarts.set(userId, cart);

  res.json({
    success: true,
    message: 'Item added to cart successfully',
    data: { cart }
  });
}));

// @route   PUT /api/cart/update
// @desc    Update cart item quantity
// @access  Private
router.put('/update', protect, [
  body('productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  body('size')
    .notEmpty()
    .withMessage('Size is required'),
  body('quantity')
    .isInt({ min: 0 })
    .withMessage('Quantity must be non-negative')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { productId, size, quantity } = req.body;
  const userId = req.user._id.toString();

  const cart = userCarts.get(userId);
  if (!cart) {
    return res.status(404).json({
      success: false,
      message: 'Cart not found'
    });
  }

  const itemIndex = cart.items.findIndex(
    item => item.productId === productId && item.size === size
  );

  if (itemIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Item not found in cart'
    });
  }

  if (quantity === 0) {
    // Remove item
    cart.items.splice(itemIndex, 1);
  } else {
    // Update quantity
    cart.items[itemIndex].quantity = quantity;
  }

  userCarts.set(userId, cart);

  res.json({
    success: true,
    message: 'Cart updated successfully',
    data: { cart }
  });
}));

// @route   DELETE /api/cart/remove
// @desc    Remove item from cart
// @access  Private
router.delete('/remove', protect, [
  body('productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  body('size')
    .notEmpty()
    .withMessage('Size is required')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { productId, size } = req.body;
  const userId = req.user._id.toString();

  const cart = userCarts.get(userId);
  if (!cart) {
    return res.status(404).json({
      success: false,
      message: 'Cart not found'
    });
  }

  const itemIndex = cart.items.findIndex(
    item => item.productId === productId && item.size === size
  );

  if (itemIndex === -1) {
    return res.status(404).json({
      success: false,
      message: 'Item not found in cart'
    });
  }

  cart.items.splice(itemIndex, 1);
  userCarts.set(userId, cart);

  res.json({
    success: true,
    message: 'Item removed from cart successfully',
    data: { cart }
  });
}));

// @route   DELETE /api/cart/clear
// @desc    Clear user's cart
// @access  Private
router.delete('/clear', protect, asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  
  userCarts.delete(userId);

  res.json({
    success: true,
    message: 'Cart cleared successfully'
  });
}));

// Sync entire cart from client (optional helper)
// @route   PUT /api/cart/sync
// @desc    Replace user's cart with client state
// @access  Private
router.put('/sync', protect, [
  body('items').isArray().withMessage('Items array required')
], asyncHandler(async (req, res) => {
  console.log('CART SYNC: USER ID', req.user && req.user._id);
  console.log('CART SYNC: BODY', req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const userId = req.user._id.toString();
  const { items, appliedCoupon } = req.body;
  const cart = { items, appliedCoupon: appliedCoupon || null };
  userCarts.set(userId, cart);
  res.json({ success: true, message: 'Cart synced', data: { cart } });
}));

module.exports = router; 