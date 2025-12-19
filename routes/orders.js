const express = require('express');
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, admin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { sendEmail } = require('../utils/email');

const router = express.Router();

// @route   POST /api/orders
// @desc    Create a new order
// @access  Private
router.post('/', protect, [
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  body('items.*.productId')
    .notEmpty()
    .withMessage('Product ID is required'),
  body('items.*.size')
    .notEmpty()
    .withMessage('Size is required'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('shippingAddress.firstName')
    .notEmpty()
    .withMessage('First name is required'),
  body('shippingAddress.lastName')
    .notEmpty()
    .withMessage('Last name is required'),
  body('shippingAddress.address')
    .notEmpty()
    .withMessage('Address is required'),
  body('shippingAddress.city')
    .notEmpty()
    .withMessage('City is required'),
  body('shippingAddress.state')
    .notEmpty()
    .withMessage('State is required'),
  body('shippingAddress.pincode')
    .matches(/^[0-9]{6}$/)
    .withMessage('Pincode must be 6 digits'),
  body('shippingAddress.phone')
    .matches(/^[0-9+\-\s()]{10,15}$/)
    .withMessage('Phone must be 10-15 digits (numbers, +, -, spaces, parentheses allowed)'),
  body('paymentMethod')
    .isIn(['card', 'cod', 'upi', 'netbanking', 'razorpay'])
    .withMessage('Invalid payment method')
], asyncHandler(async (req, res) => {
  console.log('ORDER CREATE: RAW BODY', JSON.stringify(req.body, null, 2));
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('ORDER CREATE: VALIDATION ERRORS', errors.array());
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { items, shippingAddress, paymentMethod, appliedCoupon } = req.body;

  // Validate products and check stock
  const orderItems = [];
  let subtotal = 0;

  for (const item of items) {
    console.log('ORDER CREATE: PROCESS ITEM', item);
    let product = null;
    if (item.productId.match(/^[0-9a-fA-F]{24}$/)) {
      product = await Product.findById(item.productId);
    }
    if (!product) {
      // Fallback: attempt to find by pseudo ID pattern (e.g., makhana01) using name prefix
      const pseudo = item.productId.replace(/[0-9]+$/, '');
      product = await Product.findOne({ name: new RegExp(pseudo, 'i') });
    }
    if (!product) {
      console.log('ORDER CREATE: PRODUCT NOT FOUND AFTER FALLBACK', item.productId);
      return res.status(400).json({ success: false, message: `Product ${item.productId} not found` });
    }

    if (!product.isInStock(item.size)) {
      console.log('ORDER CREATE: OUT OF STOCK', product._id, item.size);
      return res.status(400).json({
        success: false,
        message: `${product.name} (${item.size}) is out of stock`
      });
    }

    const sizeObj = product.sizes.find(s => s.size === item.size);
    const itemTotal = sizeObj.price * item.quantity;
    subtotal += itemTotal;

    orderItems.push({
      product: product._id,
      name: product.name,
      size: item.size,
      price: sizeObj.price,
      quantity: item.quantity,
      image: product.image,
      category: product.category
    });
  }

  // Calculate shipping cost based on threshold
  const config = require('../config/config');
  const shippingCost = subtotal >= config.freeShippingThreshold ? 0 : config.shippingFee;
  let discount = 0;

  if (appliedCoupon) {
    console.log('ORDER CREATE: APPLIED COUPON', appliedCoupon);
    // Apply coupon logic here
    if (appliedCoupon.type === 'percentage') {
      discount = (subtotal * appliedCoupon.discount) / 100;
    } else {
      discount = appliedCoupon.discount;
    }
    discount = Math.min(discount, subtotal);
  }

  const total = subtotal + shippingCost - discount;

  // Create order
  const order = new Order({
    user: req.user._id,
    items: orderItems,
    shippingAddress,
    paymentMethod,
    subtotal,
    shippingCost,
    discount,
    total,
    appliedCoupon,
    // Set appropriate statuses based on payment method
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
    orderStatus: 'pending'
  });

  await order.save();
  console.log('ORDER CREATE: ORDER SAVED', order._id);

  // Update product stock
  for (const item of items) {
    const product = await Product.findById(item.productId);
    product.updateStock(item.size, item.quantity);
    await product.save();
  }

  // Send order confirmation email
  try {
    await sendEmail({
      to: req.user.email,
      subject: `Order Confirmation - ${order.orderNumber}`,
      template: 'orderConfirmation',
      data: {
        name: req.user.firstName,
        orderNumber: order.orderNumber,
        orderDate: order.createdAt.toLocaleDateString(),
        total: order.total
      }
    });
  } catch (error) {
    logger.error('Order confirmation email error:', error);
  }

  res.status(201).json({
    success: true,
    message: 'Order created successfully',
    data: { order }
  });
}));

// @route   GET /api/orders
// @desc    Get user's orders
// @access  Private
router.get('/', protect, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = { user: req.user._id };
  if (status) filter.orderStatus = status;

  const orders = await Order.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('items.product', 'name image');

  const total = await Order.countDocuments(filter);

  res.json({
    success: true,
    data: {
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    }
  });
}));

// @route   GET /api/orders/:id
// @desc    Get order details
// @access  Private
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.id,
    user: req.user._id
  }).populate('items.product', 'name image description');

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  res.json({
    success: true,
    data: { order }
  });
}));

// @route   PUT /api/orders/:id/status
// @desc    Update order status (Admin only)
// @access  Private/Admin
router.put('/:id/status', protect, admin, [
  body('status')
    .isIn(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'])
    .withMessage('Invalid order status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { status, notes } = req.body;

  const order = await Order.findById(req.params.id).populate('user', 'email firstName');
  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  await order.updateStatus(status, notes);

  // Send email notifications for status changes
  if (status === 'shipped') {
    try {
      await sendEmail({
        to: order.user.email,
        subject: `Your order has been shipped - ${order.orderNumber}`,
        template: 'orderShipped',
        data: {
          name: order.shippingAddress.firstName,
          orderNumber: order.orderNumber,
          trackingNumber: order.shippingDetails.trackingNumber || 'N/A',
          carrier: order.shippingDetails.carrier || 'Standard Shipping',
          estimatedDelivery: order.shippingDetails.estimatedDelivery?.toLocaleDateString() || '3-5 business days'
        }
      });
    } catch (error) {
      logger.error('Order shipped email error:', error);
    }
  } else if (status === 'cancelled') {
    try {
      await sendEmail({
        to: order.user.email,
        subject: `Order Cancelled - ${order.orderNumber}`,
        template: 'orderCancelled',
        data: {
          name: order.shippingAddress.firstName,
          orderNumber: order.orderNumber,
          notes: notes || 'Your order has been cancelled as requested.'
        }
      });
    } catch (error) {
      logger.error('Order cancelled email error:', error);
    }
  } else if (status === 'returned') {
    try {
      await sendEmail({
        to: order.user.email,
        subject: `Return Processed - ${order.orderNumber}`,
        template: 'returnProcessed',
        data: {
          name: order.shippingAddress.firstName,
          orderNumber: order.orderNumber,
          refundAmount: order.returnRequest?.refundAmount || order.total,
          refundMethod: order.returnRequest?.refundMethod || 'original_payment',
          notes: notes || 'Your return has been processed successfully.'
        }
      });
    } catch (error) {
      logger.error('Return processed email error:', error);
    }
  }

  res.json({
    success: true,
    message: 'Order status updated successfully',
    data: { order }
  });
}));

// @route   POST /api/orders/:id/cancel
// @desc    Request order cancellation
// @access  Private
router.post('/:id/cancel', protect, [
  body('reason')
    .isIn(['changed_mind', 'wrong_item', 'defective', 'late_delivery', 'other'])
    .withMessage('Invalid cancellation reason'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { reason, description } = req.body;

  const order = await Order.findOne({
    _id: req.params.id,
    user: req.user._id
  });

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  try {
    // Directly cancel the order (no admin approval needed)
    order.orderStatus = 'cancelled';
    order.cancelRequest = {
      requestedAt: new Date(),
      reason,
      description,
      status: 'approved',
      processedAt: new Date(),
      processedBy: req.user._id
    };
    await order.save();

    // Send email notification to customer
    try {
      await sendEmail({
        to: req.user.email,
        subject: `Order Cancelled - ${order.orderNumber}`,
        template: 'orderCancelled',
        data: {
          name: order.shippingAddress.firstName,
          orderNumber: order.orderNumber,
          notes: `Your order has been cancelled. Reason: ${reason}`
        }
      });
    } catch (error) {
      logger.error('Order cancelled email error:', error);
    }

    // Send email notification to admin
    try {
      await sendEmail({
        to: process.env.EMAIL_USER,
        subject: `Order Cancelled by Customer - ${order.orderNumber}`,
        template: 'cancelRequest',
        data: {
          orderNumber: order.orderNumber,
          customerName: `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`,
          customerEmail: req.user.email,
          reason,
          description: description || 'No additional description provided',
          orderTotal: order.total
        }
      });
    } catch (error) {
      logger.error('Cancel notification email error:', error);
    }

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
}));




// @route   GET /api/orders/:id/track
// @desc    Track order status
// @access  Public (with order number)
router.get('/:id/track', asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.id })
    .populate('user', 'firstName lastName email')
    .populate('items.product', 'name image');

  if (!order) {
    return res.status(404).json({
      success: false,
      message: 'Order not found'
    });
  }

  // Create tracking timeline
  const timeline = [
    {
      status: 'pending',
      title: 'Order Placed',
      description: 'Your order has been placed and is being reviewed',
      timestamp: order.createdAt,
      completed: true
    },
    {
      status: 'confirmed',
      title: 'Order Confirmed',
      description: 'Your order has been confirmed and is being prepared',
      timestamp: order.orderStatus === 'confirmed' || ['processing', 'shipped', 'delivered'].includes(order.orderStatus) ? order.updatedAt : null,
      completed: ['confirmed', 'processing', 'shipped', 'delivered'].includes(order.orderStatus)
    },
    {
      status: 'processing',
      title: 'Processing',
      description: 'Your order is being prepared for shipment',
      timestamp: order.orderStatus === 'processing' || ['shipped', 'delivered'].includes(order.orderStatus) ? order.updatedAt : null,
      completed: ['processing', 'shipped', 'delivered'].includes(order.orderStatus)
    },
    {
      status: 'shipped',
      title: 'Shipped',
      description: order.shippingDetails?.trackingNumber 
        ? `Your order has been shipped (Tracking: ${order.shippingDetails.trackingNumber})`
        : 'Your order has been shipped',
      timestamp: order.shippingDetails?.shippedAt || (order.orderStatus === 'shipped' || order.orderStatus === 'delivered' ? order.updatedAt : null),
      completed: ['shipped', 'delivered'].includes(order.orderStatus)
    },
    {
      status: 'delivered',
      title: 'Delivered',
      description: 'Your order has been delivered',
      timestamp: order.shippingDetails?.deliveredAt || (order.orderStatus === 'delivered' ? order.updatedAt : null),
      completed: order.orderStatus === 'delivered'
    }
  ];

  res.json({
    success: true,
    data: {
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        total: order.total,
        createdAt: order.createdAt,
        items: order.items,
        shippingAddress: order.shippingAddress,
        shippingDetails: order.shippingDetails
      },
      timeline
    }
  });
}));

module.exports = router; 