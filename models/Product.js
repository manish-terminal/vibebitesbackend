const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true,
    maxlength: [1000, 'Product description cannot exceed 1000 characters']
  },
  category: {
  type: String,
  required: [true, 'Product category is required'],
  trim: true
  },
  image: {
    type: String,
    required: [true, 'Product image is required']
  },
  images: [{
    type: String,
    trim: true
  }],
  sizes: [{
    size: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative']
    },
    stock: {
      type: Number,
      required: true,
      min: [0, 'Stock cannot be negative'],
      default: 0
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    }
  }],
  ingredients: {
    type: String,
    required: [true, 'Ingredients are required'],
    trim: true
  },
  nutrition: {
    calories: {
      type: String,
      required: true,
      trim: true
    },
    protein: {
      type: String,
      required: true,
      trim: true
    },
    carbs: {
      type: String,
      required: true,
      trim: true
    },
    fat: {
      type: String,
      required: true,
      trim: true
    },
    fiber: {
      type: String,
      required: true,
      trim: true
    }
  },
  featured: {
    type: Boolean,
    default: false
  },
  inStock: {
    type: Boolean,
    default: true
  },
  rating: {
    type: Number,
    default: 0,
    min: [0, 'Rating cannot be negative'],
    max: [5, 'Rating cannot exceed 5']
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: [0, 'Review count cannot be negative']
  },
  tags: [{
    type: String,
    trim: true
  }],
  allergens: [{
    type: String,
    trim: true
  }],
  dietaryInfo: {
    isGlutenFree: {
      type: Boolean,
      default: false
    },
    isVegan: {
      type: Boolean,
      default: false
    },
    isOrganic: {
      type: Boolean,
      default: false
    },
    isSugarFree: {
      type: Boolean,
      default: false
    }
  },
  weight: {
    type: Number,
    min: [0, 'Weight cannot be negative']
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  expiryDate: {
    type: Date
  },
  video: {
    type: String,
    trim: true,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ inStock: 1 });
productSchema.index({ rating: -1 });
productSchema.index({ 'sizes.price': 1 });

// Virtual for minimum price
productSchema.virtual('minPrice').get(function() {
  if (!this.sizes || this.sizes.length === 0) return 0;
  return Math.min(...this.sizes.map(size => size.price));
});

// Virtual for maximum price
productSchema.virtual('maxPrice').get(function() {
  if (!this.sizes || this.sizes.length === 0) return 0;
  return Math.max(...this.sizes.map(size => size.price));
});

// Virtual for total stock
productSchema.virtual('totalStock').get(function() {
  if (!this.sizes || this.sizes.length === 0) return 0;
  return this.sizes.reduce((total, size) => total + size.stock, 0);
});

// Method to check if product is in stock
productSchema.methods.isInStock = function(size) {
  const sizeObj = this.sizes.find(s => s.size === size);
  return sizeObj && sizeObj.stock > 0;
};

// Method to update stock
productSchema.methods.updateStock = function(size, quantity) {
  const sizeObj = this.sizes.find(s => s.size === size);
  if (sizeObj) {
    sizeObj.stock = Math.max(0, sizeObj.stock - quantity);
    this.inStock = this.sizes.some(s => s.stock > 0);
    return true;
  }
  return false;
};

// Method to calculate average rating
productSchema.methods.updateRating = function(newRating) {
  const totalRating = (this.rating * this.reviewCount) + newRating;
  this.reviewCount += 1;
  this.rating = totalRating / this.reviewCount;
  return this.rating;
};

// Ensure virtual fields are included in JSON
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Product', productSchema); 