const express = require('express');
const { body, validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Razorpay = require('razorpay');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

// Initialize Razorpay (only if keys are provided)
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

const router = express.Router();

// @route   POST /api/payments/create-intent
// @desc    Create payment intent
// @access  Private
router.post('/create-intent', protect, [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least 1'),
  body('currency')
    .optional()
    .isIn(['inr', 'usd'])
    .withMessage('Currency must be inr or usd'),
  body('orderId')
    .optional()
    .notEmpty()
    .withMessage('Order ID is required')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { amount, currency = 'inr', orderId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata: {
        userId: req.user._id.toString(),
        orderId: orderId || 'cart-payment'
      }
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      }
    });
  } catch (error) {
    logger.error('Stripe payment intent error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment intent'
    });
  }
}));

// @route   POST /api/payments/confirm
// @desc    Confirm payment
// @access  Private
router.post('/confirm', protect, [
  body('paymentIntentId')
    .notEmpty()
    .withMessage('Payment intent ID is required'),
  body('orderId')
    .optional()
    .notEmpty()
    .withMessage('Order ID is required')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { paymentIntentId, orderId } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      res.json({
        success: true,
        message: 'Payment confirmed successfully',
        data: {
          paymentIntentId,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          status: paymentIntent.status
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }
  } catch (error) {
    logger.error('Payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error confirming payment'
    });
  }
}));

// @route   GET /api/payments/:orderId
// @desc    Get payment status
// @access  Private
router.get('/:orderId', protect, asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  try {
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 1,
      metadata: { orderId }
    });

    if (paymentIntents.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    const paymentIntent = paymentIntents.data[0];

    res.json({
      success: true,
      data: {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        created: paymentIntent.created
      }
    });
  } catch (error) {
    logger.error('Payment status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving payment status'
    });
  }
}));

// @route   POST /api/payments/webhook
// @desc    Stripe webhook handler
// @access  Public
// Note: Raw body parsing is configured at app level for this route
router.post('/webhook', asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      logger.info('Payment succeeded:', paymentIntent.id);
      // Handle successful payment
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      logger.info('Payment failed:', failedPayment.id);
      // Handle failed payment
      break;
    default:
      logger.info(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
}));

// ==================== RAZORPAY PAYMENT ROUTES ====================

// @route   POST /api/payments/razorpay/create-order
// @desc    Create Razorpay order
// @access  Private
router.post('/razorpay/create-order', protect, [
  body('amount')
    .isFloat({ min: 1 })
    .withMessage('Amount must be at least 1'),
  body('currency')
    .optional()
    .isIn(['INR'])
    .withMessage('Currency must be INR'),
  body('orderId')
    .optional()
    .notEmpty()
    .withMessage('Order ID is required')
], asyncHandler(async (req, res) => {
  // Check if Razorpay is initialized
  if (!razorpay) {
    return res.status(503).json({
      success: false,
      message: 'Razorpay payment service is not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to environment variables.'
    });
  }

  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { amount, currency = 'INR', orderId } = req.body;

  try {
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency,
      receipt: orderId || `receipt_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        orderId: orderId || 'cart-payment'
      }
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      }
    });
  } catch (error) {
    logger.error('Razorpay order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating payment order'
    });
  }
}));

// @route   POST /api/payments/razorpay/verify
// @desc    Verify Razorpay payment
// @access  Private
router.post('/razorpay/verify', protect, [
  body('orderId')
    .notEmpty()
    .withMessage('Order ID is required'),
  body('paymentId')
    .notEmpty()
    .withMessage('Payment ID is required'),
  body('signature')
    .notEmpty()
    .withMessage('Signature is required')
], asyncHandler(async (req, res) => {
  // Check if Razorpay is initialized
  if (!razorpay) {
    return res.status(503).json({
      success: false,
      message: 'Razorpay payment service is not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to environment variables.'
    });
  }

  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { orderId, paymentId, signature } = req.body;

  try {
    // Verify the payment signature
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    if (expectedSignature === signature) {
      // Payment is verified
      res.json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          orderId,
          paymentId,
          signature,
          verified: true
        }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  } catch (error) {
    logger.error('Razorpay payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment'
    });
  }
}));

// @route   GET /api/payments/razorpay/keys
// @desc    Get Razorpay public key
// @access  Public
router.get('/razorpay/keys', asyncHandler(async (req, res) => {
  if (!process.env.RAZORPAY_KEY_ID) {
    return res.status(503).json({
      success: false,
      message: 'Razorpay payment service is not configured. Please add RAZORPAY_KEY_ID to environment variables.'
    });
  }

  res.json({
    success: true,
    data: {
      keyId: process.env.RAZORPAY_KEY_ID
    }
  });
}));

module.exports = router; 