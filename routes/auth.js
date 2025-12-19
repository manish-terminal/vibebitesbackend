const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { sendEmail } = require('../utils/email');
const { validatePasswordStrength, validateIndianPhone } = require('../utils/validation');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .custom((password) => {
      const validation = validatePasswordStrength(password);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      return true;
    }),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .custom((phone) => {
      if (phone && !validateIndianPhone(phone)) {
        throw new Error('Please enter a valid 10-digit Indian mobile number');
      }
      return true;
    }),
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password, firstName, lastName, phone } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User with this email already exists'
    });
  }

  // Create user
  const user = await User.create({
    email,
    password,
    firstName,
    lastName,
    phone
  });

  // Generate JWT token immediately
  const token = user.generateAuthToken();

  // Send welcome email asynchronously (don't wait for it)
  sendEmail({
    to: user.email,
    subject: 'Welcome to VIBE BITES!',
    template: 'welcomeEmail',
    data: {
      name: user.firstName,
      email: user.email
    }
  }).catch(error => {
    logger.error('Welcome email error:', error);
  });

  // Determine if we're in production (HTTPS)
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
  
  res.cookie('token', token, {
    httpOnly: true,
    secure: isSecure, // true for HTTPS (production), false for HTTP (development)
    sameSite: isSecure ? 'none' : 'lax', // 'none' required for cross-origin cookies in HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
  res.status(201).json({
    success: true,
    message: 'User registered successfully. Welcome to VIBE BITES!',
    token: token, // Include token in response for localStorage
    data: {
      user
    }
  });
}));

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user and include password for comparison
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: 'Account is deactivated'
    });
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials'
    });
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate JWT token
  const token = user.generateAuthToken();

  // Determine if we're in production (HTTPS)
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
  
  res.cookie('token', token, {
    httpOnly: true,
    secure: isSecure, // true for HTTPS (production), false for HTTP (development)
    sameSite: isSecure ? 'none' : 'lax', // 'none' required for cross-origin cookies in HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
  res.json({
    success: true,
    message: 'Login successful',
    token: token, // Include token in response for localStorage
    data: {
      user
    }
  });
}));

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', protect, asyncHandler(async (req, res) => {
  // Ensure user exists (should always be set by protect middleware)
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'User not authenticated'
    });
  }

  // Convert mongoose document to plain object to ensure proper serialization
  const userData = req.user.toObject ? req.user.toObject() : req.user;

  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: userData
  });
}));

// @route   GET /api/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', protect, asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    data: {
      user: req.user
    }
  });
}));

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .custom((phone) => {
      if (phone && !validateIndianPhone(phone)) {
        throw new Error('Please enter a valid 10-digit Indian mobile number');
      }
      return true;
    }),
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { firstName, lastName, phone } = req.body;

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    req.user._id,
    {
      firstName: firstName || req.user.firstName,
      lastName: lastName || req.user.lastName,
      phone: phone || req.user.phone
    },
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: updatedUser
    }
  });
}));

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail()
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Generate password reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save();

  // Send password reset email
  try {
    const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: 'Reset your VIBE BITES password',
      template: 'passwordReset',
      data: {
        name: user.firstName,
        resetUrl
      }
    });

    res.json({
      success: true,
      message: 'Password reset email sent successfully'
    });
  } catch (error) {
    logger.error('Password reset email error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending password reset email'
    });
  }
}));

// @route   POST /api/auth/reset-password
// @desc    Reset password with token
// @access  Public
router.post('/reset-password', [
  body('token')
    .notEmpty()
    .withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .custom((password) => {
      const validation = validatePasswordStrength(password);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      return true;
    }),
], asyncHandler(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { token, password } = req.body;

  // Find user with reset token
  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: Date.now() }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }

  // Update password
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
}));


// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', protect, asyncHandler(async (req, res) => {
  // Determine if we're in production (HTTPS)
  const isProduction = process.env.NODE_ENV === 'production';
  const isSecure = isProduction || req.secure || req.headers['x-forwarded-proto'] === 'https';
  
  res.clearCookie('token', {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    path: '/',
  });
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

module.exports = router; 