const express = require('express');
const { body, validationResult } = require('express-validator');
const Coupon = require('../models/Coupon');
const { protect, admin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// @route   GET /api/coupons
// @desc    Get all active coupons
// @access  Public
router.get('/', asyncHandler(async (req, res) => {
  const coupons = await Coupon.find({ isActive: true })
    .select('code description discount type categories minOrderAmount maxDiscount validUntil')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: { coupons }
  });
}));

// @route   POST /api/coupons/validate
// @desc    Validate a coupon code
// @access  Public (authentication optional for guest users)
router.post('/validate', [
  body('code')
    .notEmpty()
    .withMessage('Coupon code is required')
    .toUpperCase(),
  body('orderAmount')
    .isFloat({ min: 0 })
    .withMessage('Order amount must be a positive number')
], asyncHandler(async (req, res) => {
  // Debug log incoming request body
  console.log('COUPON VALIDATE REQUEST BODY:', req.body);

  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('COUPON VALIDATE ERRORS:', errors.array());
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { code, orderAmount, items = [] } = req.body;
  console.log('COUPON VALIDATE CODE:', code, 'ORDER AMOUNT:', orderAmount);

  const coupon = await Coupon.findOne({ code });
  if (!coupon) {
    console.log('COUPON NOT FOUND:', code);
    return res.status(400).json({
      success: false,
      message: 'Invalid coupon code'
    });
  }

  // Check if coupon can be applied
  // For guest users, we'll skip user-specific validations
  let isFirstTime = true; // Default for guest users
  let userId = null;
  
  if (req.user) {
    isFirstTime = !req.user.orders || req.user.orders.length === 0;
    userId = req.user._id;
  }
  
  const canBeApplied = coupon.canBeApplied(orderAmount, userId, isFirstTime);
  console.log('COUPON CAN BE APPLIED:', canBeApplied);

  if (!canBeApplied) {
    console.log('COUPON CANNOT BE APPLIED:', code, 'OrderAmount:', orderAmount, 'User:', userId);
    return res.status(400).json({
      success: false,
      message: 'Coupon cannot be applied to this order'
    });
  }

  // Calculate discount
  // Pass full items list; model method filters by categories if defined
  const discountAmount = coupon.calculateDiscount(orderAmount, items);
  console.log('COUPON DISCOUNT AMOUNT:', discountAmount);

  res.json({
    success: true,
    message: 'Coupon applied successfully',
    data: {
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discount: coupon.discount,
        type: coupon.type,
        categories: coupon.categories,
        minOrderAmount: coupon.minOrderAmount,
        maxDiscount: coupon.maxDiscount,
        maxDiscountAmount: coupon.maxDiscount // For backward compatibility
      },
      discountAmount
    }
  });
}));

// Development helper: create a default coupon if none exists (NOT for production)
if (process.env.NODE_ENV !== 'production') {
  router.post('/dev/create-default', protect, asyncHandler(async (req, res) => {
    const code = (req.body.code || 'VIBE10').toUpperCase();
    const existing = await Coupon.findOne({ code });
    if (existing) {
      return res.json({ success: true, message: 'Coupon already exists', data: { coupon: existing } });
    }
    const now = new Date();
    const coupon = await Coupon.create({
      code,
      description: '10% off your order',
      discount: 10,
      type: 'percentage',
      categories: [],
      minOrderAmount: 0,
      maxDiscount: 100,
      validFrom: now,
      validUntil: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
      isFirstTimeOnly: false
    });
    res.status(201).json({ success: true, message: 'Default coupon created', data: { coupon } });
  }));
}

// @route   POST /api/coupons
// @desc    Create a new coupon (Admin only)
// @access  Private/Admin
router.post('/', protect, admin, [
  body('code')
    .notEmpty()
    .withMessage('Coupon code is required')
    .isLength({ max: 20 })
    .withMessage('Coupon code cannot exceed 20 characters'),
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters'),
  body('discount')
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('type')
    .isIn(['percentage', 'fixed'])
    .withMessage('Type must be percentage or fixed'),
  body('categories')
    .optional()
    .isArray(),
  body('minOrderAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum order amount must be positive'),
  body('maxDiscount')
    .optional()
    .isFloat({ min: -1 })
    .withMessage('Maximum discount must be -1 or positive'),
  body('usageLimit')
    .optional()
    .isInt({ min: -1 })
    .withMessage('Usage limit must be -1 or positive'),
  body('validFrom')
    .optional()
    .isISO8601()
    .withMessage('Valid from must be a valid date'),
  body('validUntil')
    .isISO8601()
    .withMessage('Valid until must be a valid date'),
  body('isActive')
    .optional()
    .isBoolean(),
  body('isFirstTimeOnly')
    .optional()
    .isBoolean(),
  body('applicableUsers')
    .optional()
    .isArray(),
  body('excludedUsers')
    .optional()
    .isArray(),
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const coupon = await Coupon.create(req.body);

  res.status(201).json({
    success: true,
    message: 'Coupon created successfully',
    data: { coupon }
  });
}));

// @route   PUT /api/coupons/:id
// @desc    Update a coupon (Admin only)
// @access  Private/Admin
router.put('/:id', protect, admin, [
  body('description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters'),
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('type')
    .optional()
    .isIn(['percentage', 'fixed'])
    .withMessage('Type must be percentage or fixed'),
  body('category')
    .optional()
    .isIn(['Makhana', 'Chips', 'Bites', 'Nuts', 'Seeds'])
    .withMessage('Invalid category'),
  body('minOrderAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Minimum order amount must be positive'),
  body('maxDiscount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Maximum discount must be positive'),
  body('usageLimit')
    .optional()
    .isInt({ min: -1 })
    .withMessage('Usage limit must be -1 or positive'),
  body('validUntil')
    .optional()
    .isISO8601()
    .withMessage('Valid until must be a valid date')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const coupon = await Coupon.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!coupon) {
    return res.status(404).json({
      success: false,
      message: 'Coupon not found'
    });
  }

  res.json({
    success: true,
    message: 'Coupon updated successfully',
    data: { coupon }
  });
}));

// @route   DELETE /api/coupons/:id
// @desc    Delete a coupon (Admin only)
// @access  Private/Admin
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );

  if (!coupon) {
    return res.status(404).json({
      success: false,
      message: 'Coupon not found'
    });
  }

  res.json({
    success: true,
    message: 'Coupon deleted successfully'
  });
}));

module.exports = router; 