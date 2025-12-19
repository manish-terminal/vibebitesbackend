const express = require('express');
const { body, validationResult } = require('express-validator');
const Product = require('../models/Product');
const Review = require('../models/Review');
const Order = require('../models/Order');
const { protect, admin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendEmail } = require('../utils/email');
const { logger } = require('../utils/logger');

const router = express.Router();

// @route   GET /api/reviews/product/:productId
// @desc    Get reviews for a product
// @access  Public
router.get('/product/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  const [reviews, total] = await Promise.all([
    Review.find({ product: productId, isActive: true })
      .populate('user', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Review.countDocuments({ product: productId, isActive: true })
  ]);

  const formatted = reviews.map(r => ({
    id: r._id,
    userId: r.user?._id,
    userName: r.user ? `${r.user.firstName} ${r.user.lastName}` : 'User',
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    date: r.createdAt,
    verified: true
  }));

  res.json({
    success: true,
    data: {
      reviews: formatted,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      },
      productRating: product.rating,
      totalReviews: product.reviewCount
    }
  });
}));

// @route   POST /api/reviews
// @desc    Add a review for a product (legacy endpoint)
// @access  Private
router.post('/', protect, [
  body('productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('comment')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Comment must be between 10 and 500 characters')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { productId, rating, title, comment } = req.body;

  // Check if product exists
  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Check if user has already reviewed this product
  const existingReview = await Review.findOne({ product: productId, user: req.user._id });
  if (existingReview) {
    return res.status(400).json({
      success: false,
      message: 'You have already reviewed this product'
    });
  }

  // Create review
  const review = await Review.create({
    product: productId,
    user: req.user._id,
    rating,
    title,
    comment
  });

  // Update product rating and count
  product.updateRating(rating);
  await product.save();

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    data: {
      review: {
        id: review._id,
        userId: req.user._id,
        userName: `${req.user.firstName} ${req.user.lastName}`,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        date: review.createdAt,
        verified: true
      },
      newProductRating: product.rating
    }
  });
}));

// @route   POST /api/reviews/order/:orderId
// @desc    Add a review for a delivered order
// @access  Private
router.post('/order/:orderId', protect, [
  body('productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('title')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('comment')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Comment must be between 10 and 500 characters')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { orderId } = req.params;
  const { productId, rating, title, comment } = req.body;

  // Check if order exists and belongs to user
  const order = await Order.findOne({ _id: orderId, user: req.user._id });
  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Check if order is delivered
  if (order.orderStatus !== 'delivered') {
    return res.status(400).json({
      success: false,
      message: 'You can only review delivered orders'
    });
  }

  // Check if product exists in the order
  const orderItem = order.items.find(item => item.product.toString() === productId);
  if (!orderItem) {
    return res.status(400).json({
      success: false,
      message: 'Product not found in this order'
    });
  }

  // Check if product exists
  const product = await Product.findById(productId);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found'
    });
  }

  // Check if user has already reviewed this product for this order
  const existingReview = await Review.findOne({ 
    product: productId, 
    user: req.user._id, 
    order: orderId 
  });
  if (existingReview) {
    return res.status(400).json({
      success: false,
      message: 'You have already reviewed this product for this order'
    });
  }

  // Create review
  const review = await Review.create({
    product: productId,
    user: req.user._id,
    order: orderId,
    rating,
    title,
    comment,
    isVerified: true
  });

  // Update product rating and count
  product.updateRating(rating);
  await product.save();

  // Send email notification to admin about new review
  try {
    await sendEmail({
      to: process.env.EMAIL_USER,
      subject: `New Review - ${product.name}`,
      template: 'newReview',
      data: {
        productName: product.name,
        customerName: `${req.user.firstName} ${req.user.lastName}`,
        rating,
        title,
        comment,
        orderNumber: order.orderNumber
      }
    });
  } catch (error) {
    logger.error('New review email error:', error);
  }

  res.status(201).json({
    success: true,
    message: 'Review added successfully',
    data: {
      review: {
        id: review._id,
        userId: req.user._id,
        userName: `${req.user.firstName} ${req.user.lastName}`,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        date: review.createdAt,
        verified: true,
        orderNumber: order.orderNumber
      },
      newProductRating: product.rating
    }
  });
}));

// @route   PUT /api/reviews/:id
// @desc    Update a review
// @access  Private
router.put('/:id', protect, [
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('Title must be between 5 and 100 characters'),
  body('comment')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Comment must be between 10 and 500 characters')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { id } = req.params;
  const { rating, title, comment } = req.body;

  const review = await Review.findOneAndUpdate(
    { _id: id, user: req.user._id },
    { $set: { rating, title, comment } },
    { new: true }
  ).populate('user', 'firstName lastName');

  if (!review) {
    return res.status(404).json({ success: false, message: 'Review not found' });
  }

  res.json({
    success: true,
    message: 'Review updated successfully',
    data: {
      review: {
        id: review._id,
        userId: review.user?._id,
        userName: review.user ? `${review.user.firstName} ${review.user.lastName}` : 'User',
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        date: review.updatedAt,
        verified: true
      }
    }
  });
}));

// @route   DELETE /api/reviews/:id
// @desc    Delete a review
// @access  Private
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const review = await Review.findOneAndUpdate(
    { _id: id, user: req.user._id },
    { isActive: false },
    { new: true }
  );

  if (!review) {
    return res.status(404).json({ success: false, message: 'Review not found' });
  }

  res.json({
    success: true,
    message: 'Review deleted successfully'
  });
}));

// @route   GET /api/reviews/admin
// @desc    Get all reviews for admin
// @access  Private/Admin
router.get('/admin', protect, admin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status = 'all' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  let filter = {};
  if (status === 'active') {
    filter.isActive = true;
  } else if (status === 'inactive') {
    filter.isActive = false;
  }

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'firstName lastName email')
      .populate('product', 'name image')
      .populate('order', 'orderNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Review.countDocuments(filter)
  ]);

  const formatted = reviews.map(r => ({
    id: r._id,
    userId: r.user?._id,
    userName: r.user ? `${r.user.firstName} ${r.user.lastName}` : 'User',
    userEmail: r.user?.email,
    productId: r.product?._id,
    productName: r.product?.name,
    productImage: r.product?.image,
    orderId: r.order?._id,
    orderNumber: r.order?.orderNumber,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    date: r.createdAt,
    verified: r.isVerified,
    isActive: r.isActive
  }));

  res.json({
    success: true,
    data: {
      reviews: formatted,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    }
  });
}));

// @route   PUT /api/reviews/admin/:id/status
// @desc    Update review status (Admin only)
// @access  Private/Admin
router.put('/admin/:id/status', protect, admin, [
  body('isActive')
    .isBoolean()
    .withMessage('isActive must be a boolean value')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { id } = req.params;
  const { isActive } = req.body;

  const review = await Review.findByIdAndUpdate(
    id,
    { isActive },
    { new: true }
  ).populate('user', 'firstName lastName email')
   .populate('product', 'name')
   .populate('order', 'orderNumber');

  if (!review) {
    return res.status(404).json({
      success: false,
      message: 'Review not found'
    });
  }

  res.json({
    success: true,
    message: `Review ${isActive ? 'activated' : 'deactivated'} successfully`,
    data: {
      review: {
        id: review._id,
        userName: review.user ? `${review.user.firstName} ${review.user.lastName}` : 'User',
        productName: review.product?.name,
        orderNumber: review.order?.orderNumber,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        isActive: review.isActive
      }
    }
  });
}));

// @route   GET /api/reviews/user
// @desc    Get reviews submitted by the current user
// @access  Private
router.get('/user', protect, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [reviews, total] = await Promise.all([
    Review.find({ user: req.user._id })
      .populate('product', 'name image')
      .populate('order', 'orderNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Review.countDocuments({ user: req.user._id })
  ]);

  const formatted = reviews.map(r => ({
    id: r._id,
    productId: r.product?._id,
    productName: r.product?.name,
    productImage: r.product?.image,
    orderNumber: r.order?.orderNumber,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    isActive: r.isActive,
    createdAt: r.createdAt
  }));

  res.json({
    success: true,
    data: {
      reviews: formatted,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    }
  });
}));

module.exports = router; 