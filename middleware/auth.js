const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logger } = require('../utils/logger');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header first (for frontend using localStorage)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } 
    // Fallback to cookie token
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // Check if token exists
    if (!token) {
      logger.warn('No token provided in request', {
        hasAuthHeader: !!req.headers.authorization,
        hasCookies: !!req.cookies,
        url: req.originalUrl
      });
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided. Please login again.'
      });
    }

    // Verify token
    if (!process.env.JWT_SECRET) {
      logger.error('JWT_SECRET is not configured');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    let user;
    try {
      user = await User.findById(decoded.id).select('-password');
    } catch (dbError) {
      logger.error('Database error in protect middleware:', dbError);
      return res.status(503).json({
        success: false,
        message: 'Database connection error. Please try again later.'
      });
    }
    
    if (!user) {
      logger.warn('User not found for token', { userId: decoded.id });
      return res.status(401).json({
        success: false,
        message: 'User not found.'
      });
    }

    if (!user.isActive) {
      logger.warn('Inactive user attempted access', { userId: user._id });
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'JsonWebTokenError') {
      logger.warn('Invalid token provided', { error: error.message });
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please login again.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      logger.warn('Expired token provided', { expiredAt: error.expiredAt });
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please login again.'
      });
    }
    
    logger.error('Protect middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed. Please login again.'
    });
  }
};

// Admin only routes
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
};

// Check if user is verified
const requireVerification = (req, res, next) => {
  if (req.user && req.user.isEmailVerified) {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Email verification required.'
    });
  }
};

// Optional auth - doesn't fail if token is missing or expired
// Sets req.user if valid token exists, otherwise req.user is undefined
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    // Prefer cookie token, fallback to Authorization header
    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token, continue without user
    if (!token) {
      req.user = undefined;
      return next();
    }

    // Try to verify token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.isActive) {
        req.user = user;
      } else {
        req.user = undefined;
      }
    } catch (error) {
      // Token is invalid or expired, continue without user
      req.user = undefined;
    }
    
    next();
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    // On error, continue without user
    req.user = undefined;
    next();
  }
};

module.exports = {
  protect,
  admin,
  requireVerification,
  optionalAuth
};