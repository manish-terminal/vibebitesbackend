// Load environment variables first
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const path = require('path');
const fs = require('fs');

// Load config with error handling
let config;
try {
  config = require('./config/config');
} catch (error) {
  console.error('Failed to load config:', error);
  process.exit(1);
}

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const cartRoutes = require('./routes/cart');
const orderRoutes = require('./routes/orders');
const couponRoutes = require('./routes/coupons');
const paymentRoutes = require('./routes/payments');
const reviewRoutes = require('./routes/reviews');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');
const adminProductCreateRoute = require('./routes/adminProducts');
const wishlistRoutes = require('./routes/wishlist');
const uploadsRoutes = require('./routes/uploads');
const announcementRoutes = require('./routes/announcements');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { logger } = require('./utils/logger');
const { sanitizeRequest } = require('./utils/validation');

const app = express();

// Trust proxy if behind a reverse proxy (for rate limiting)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: function (origin, callback) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://vibebitstest-env.eba-ubvupniq.ap-south-1.elasticbeanstalk.com',
      'https://vibe-bites-frontend.vercel.app',
      'https://www.vibebites.shop',
      'https://vibe-bites-backend.onrender.com',
      'https://vibebites.shop',
      'https://snacks-front01-g1bl.vercel.app',
      'https://snacks-front01-g1bl.vercel.app/',
      'https://snacks-front01.vercel.app',
      'https://snacks-front01.vercel.app/',
      'https://vibebitesfrontend.vercel.app'


    ];
    
    // Allow requests with no origin (like mobile apps, curl, Postman, or same-origin requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log the blocked origin for debugging
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control', 'Accept'],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Rate limiting with configuration
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.general,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for OPTIONS requests (CORS preflight)
  skip: (req) => req.method === 'OPTIONS'
});

// Apply rate limiting to API routes (but skip OPTIONS requests)
app.use('/api/', limiter);

// Stricter rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.auth,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.'
  },
  // Skip rate limiting for OPTIONS requests (CORS preflight)
  skip: (req) => req.method === 'OPTIONS'
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// Stripe webhook must access the raw body, so we apply raw body parser just for that route BEFORE json parser
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Input sanitization middleware
app.use((req, res, next) => {
  try {
    if (req.body) {
      req.body = sanitizeRequest(req.body);
    }
    if (req.query) {
      req.query = sanitizeRequest(req.query);
    }
    if (req.params) {
      req.params = sanitizeRequest(req.params);
    }
  } catch (error) {
    logger.error('Input sanitization error:', error);
    return res.status(400).json({
      success: false,
      error: 'Invalid input data'
    });
  }
  next();
});

// Logging middleware
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Serve static files from uploads directory with explicit CORS headers
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Cache-Control, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Fallback placeholder for missing uploaded assets to avoid noisy 404s
const placeholderImagePath = path.join(__dirname, 'uploads', 'placeholder.svg');
app.use('/uploads', (req, res) => {
  res.sendFile(placeholderImagePath);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'VIBE BITES API is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/products', adminProductCreateRoute);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/announcements', announcementRoutes);

// Catch all handler for undefined routes
app.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware
app.use(errorHandler);

// Connect to MongoDB
const connectDB = async () => {
  try {
    if (!config.mongodb || !config.mongodb.uri) {
      logger.warn('MongoDB URI not configured. Skipping database connection.');
      return;
    }
    await mongoose.connect(config.mongodb.uri, config.mongodb.options || {});
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    logger.warn('Continuing without MongoDB connection...');
    // Don't exit - let the app run without DB
  }
};

// Start server
const startServer = async () => {
  try {
    // Log startup attempt
    console.log('Starting server...');
    console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    console.log(`PORT: ${process.env.PORT || 'not set'}`);

    // Validate required config
    if (!config) {
      console.error('Configuration is missing. Please check your NODE_ENV and config file.');
      logger.error('Configuration is missing. Please check your NODE_ENV and config file.');
      process.exit(1);
    }

    if (!config.port) {
      console.error('PORT is not configured. Please set PORT environment variable.');
      logger.error('PORT is not configured. Please set PORT environment variable.');
      process.exit(1);
    }

    console.log(`Config loaded: port=${config.port}, hasMongoDB=${!!config.mongodb}`);

    // Validate production environment variables
    if (process.env.NODE_ENV === 'production') {
      // MongoDB URI is now hardcoded in config, no need to check
      if (!process.env.JWT_SECRET) {
        const errorMsg = 'JWT_SECRET is required in production. Please set the environment variable.';
        console.error(errorMsg);
        logger.error(errorMsg);
        process.exit(1);
      }
      console.log('Production environment variables validated successfully');
    }

    // Start server first (don't wait for DB)
    let server;
    try {
      server = app.listen(config.port, '0.0.0.0', () => {
        const message = `Server running on port ${config.port} in ${process.env.NODE_ENV || 'development'} mode`;
        console.log(message);
        logger.info(message);
      });

      // Handle server errors
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          const errorMsg = `Port ${config.port} is already in use`;
          console.error(errorMsg);
          logger.error(errorMsg);
          process.exit(1);
        } else {
          console.error('Server error:', error);
          logger.error('Server error:', error);
          process.exit(1);
        }
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      logger.error('Failed to start server:', error);
      process.exit(1);
    }

    // Connect to database in background (non-blocking)
    connectDB().then(() => {
      // Seed default coupon if in development (after DB connects)
      if (process.env.NODE_ENV !== 'production') {
        setTimeout(async () => {
          try {
            const Coupon = require('./models/Coupon');
            const code = 'VIBE10';
            const existing = await Coupon.findOne({ code });
            if (!existing) {
              const now = new Date();
              await Coupon.create({
                code,
                description: '10% off your order',
                discount: 10,
                type: 'percentage',
                categories: [],
                minOrderAmount: 0,
                maxDiscount: 100,
                validFrom: now,
                validUntil: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
                isActive: true,
                isFirstTimeOnly: false
              });
              logger.info('Seeded default coupon VIBE10');
            } else {
              logger.info('Default coupon VIBE10 already present');
            }
          } catch (e) {
            logger.error('Error seeding default coupon:', e);
            // Don't exit - continue without seeding
          }
        }, 2000); // Wait 2 seconds for DB to be ready
      }
    }).catch(err => {
      logger.error('Database connection failed:', err);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Rejection:', err);
  // In production, exit to allow process manager to restart
  if (process.env.NODE_ENV === 'production') {
    logger.error('Exiting due to unhandled rejection in production');
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  // Always exit on uncaught exceptions - they're dangerous
  process.exit(1);
});

// Handle SIGTERM gracefully (for Railway, Docker, etc.)
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

// Handle SIGINT gracefully (Ctrl+C)
process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Wrap startup in try-catch to catch any synchronous errors
try {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
} catch (error) {
  console.error('Fatal error during startup:', error);
  process.exit(1);
}

module.exports = app;