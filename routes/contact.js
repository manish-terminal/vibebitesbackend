const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const { sendEmail } = require('../utils/email');
const { logger } = require('../utils/logger');

const router = express.Router();

// @route   POST /api/contact
// @desc    Submit contact form
// @access  Public
router.post('/', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('subject')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Subject must be between 5 and 200 characters'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('Message must be between 10 and 1000 characters'),
  body('phone')
    .optional()
    .matches(/^[0-9]{10}$/)
    .withMessage('Please enter a valid 10-digit phone number')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { name, email, subject, message, phone } = req.body;

  // Send email to admin
  try {
    await sendEmail({
      to: process.env.EMAIL_USER,
      subject: `Contact Form: ${subject}`,
      template: 'contactForm',
      data: {
        name,
        email,
        subject,
        message,
        phone: phone || 'Not provided'
      }
    });

    // Send confirmation email to user
    await sendEmail({
      to: email,
      subject: 'Thank you for contacting VIBE BITES',
      template: 'contactConfirmation',
      data: {
        name,
        subject
      }
    });

    res.json({
      success: true,
      message: 'Thank you for your message. We\'ll get back to you soon!'
    });
  } catch (error) {
    logger.error('Contact form email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message. Please try again later.'
    });
  }
}));

// @route   GET /api/contact/faq
// @desc    Get FAQ data
// @access  Public
router.get('/faq', asyncHandler(async (req, res) => {
  const faqs = [
    {
      id: 1,
      question: 'What are the delivery charges?',
      answer: 'We offer free shipping on all orders above ₹500. For orders below ₹500, a nominal delivery charge of ₹50 applies.'
    },
    {
      id: 2,
      question: 'How long does delivery take?',
      answer: 'Standard delivery takes 3-5 business days. Express delivery (1-2 days) is available for an additional charge.'
    },
    {
      id: 3,
      question: 'Are your products gluten-free?',
      answer: 'Most of our products are gluten-free. Please check the product description for specific dietary information.'
    },
    {
      id: 4,
      question: 'What is your return policy?',
      answer: 'We accept returns within 7 days of delivery for damaged or incorrect items. Please contact our customer support for assistance.'
    },
    {
      id: 5,
      question: 'Do you ship internationally?',
      answer: 'Currently, we only ship within India. We\'re working on expanding our international shipping options.'
    },
    {
      id: 6,
      question: 'How can I track my order?',
      answer: 'You\'ll receive a tracking number via email once your order ships. You can also track your order in your account dashboard.'
    },
    {
      id: 7,
      question: 'Are your products organic?',
      answer: 'We use high-quality, natural ingredients. Many of our products are organic - check individual product descriptions for details.'
    },
    {
      id: 8,
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit/debit cards, UPI, net banking, and cash on delivery.'
    }
  ];

  res.json({
    success: true,
    data: { faqs }
  });
}));

// @route   GET /api/contact/support
// @desc    Get support information
// @access  Public
router.get('/support', asyncHandler(async (req, res) => {
  const supportInfo = {
    email: 'hello@vibebites.com',
    phone: '+91 98765 43210',
    address: {
      street: '123 Snack Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      country: 'India'
    },
    businessHours: {
      monday: '9:00 AM - 6:00 PM',
      tuesday: '9:00 AM - 6:00 PM',
      wednesday: '9:00 AM - 6:00 PM',
      thursday: '9:00 AM - 6:00 PM',
      friday: '9:00 AM - 6:00 PM',
      saturday: '10:00 AM - 4:00 PM',
      sunday: 'Closed'
    },
    socialMedia: {
      facebook: 'https://facebook.com/vibebites',
      twitter: 'https://twitter.com/vibebites',
      instagram: 'https://instagram.com/vibebites'
    }
  };

  res.json({
    success: true,
    data: { supportInfo }
  });
}));

module.exports = router; 