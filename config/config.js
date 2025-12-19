const config = {
  development: {
    port: process.env.PORT || 3000,
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vibe-bites',
      options: {
        maxPoolSize: 10,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'your-secret-key',
      expiresIn: '7d'
    },
    email: {
      service: 'gmail',
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD
    },
    uploads: {
      maxFileSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
      maxFiles: 5
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      general: 1000, // requests per window (increased for development)
      auth: 50, // auth requests per window (increased for development)
      upload: 10 // upload requests per window
    },
    shippingFee: 49, // default shipping fee in INR
    freeShippingThreshold: 500, // free shipping above this amount in INR
    security: {
      bcryptRounds: 12,
      maxPasswordLength: 128,
      minPasswordLength: 8
    }
  },
  production: {
    port: process.env.PORT || 3000,
    mongodb: {
      uri: process.env.MONGODB_URI || process.env.MONGODB_URI_PROD,
      options: {
        maxPoolSize: 20,
        minPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: '7d'
    },
    email: {
      service: 'gmail',
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD
    },
    uploads: {
      maxFileSize: 5 * 1024 * 1024, // 5MB
      allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
      maxFiles: 5
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      general: 100, // requests per window
      auth: 5, // auth requests per window
      upload: 10 // upload requests per window
    },
    shippingFee: 49, // default shipping fee in INR
    freeShippingThreshold: 500, // free shipping above this amount in INR
    security: {
      bcryptRounds: 14,
      maxPasswordLength: 128,
      minPasswordLength: 8
    }
  },
  test: {
    port: process.env.PORT || 5001,
    mongodb: {
      uri: process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/vibe-bites-test',
      options: {
        maxPoolSize: 5,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }
    },
    jwt: {
      secret: 'test-secret-key',
      expiresIn: '1h'
    },
    email: {
      service: 'gmail',
      user: 'test@test.com',
      password: 'test-password'
    },
    uploads: {
      maxFileSize: 1 * 1024 * 1024, // 1MB for testing
      allowedTypes: ['image/jpeg', 'image/jpg', 'image/png'],
      maxFiles: 3
    },
    rateLimit: {
      windowMs: 1 * 60 * 1000, // 1 minute for testing
      general: 1000, // higher limit for testing
      auth: 50,
      upload: 20
    },
    shippingFee: 49, // default shipping fee in INR
    freeShippingThreshold: 500, // free shipping above this amount in INR
    security: {
      bcryptRounds: 4, // faster for testing
      maxPasswordLength: 128,
      minPasswordLength: 6 // relaxed for testing
    }
  }
};

const env = process.env.NODE_ENV || 'development';
const selectedConfig = config[env];

if (!selectedConfig) {
  console.error(`Invalid NODE_ENV: ${env}. Falling back to development.`);
  module.exports = config.development;
} else {
  module.exports = selectedConfig;
}
