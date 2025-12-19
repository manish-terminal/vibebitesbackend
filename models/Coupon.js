const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: [true, 'Coupon code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: [20, 'Coupon code cannot exceed 20 characters']
  },
  description: {
    type: String,
    required: [true, 'Coupon description is required'],
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  discount: {
    type: Number,
    required: [true, 'Discount amount is required'],
    min: [0, 'Discount cannot be negative']
  },
  type: {
    type: String,
    required: [true, 'Discount type is required'],
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  categories: [{
    type: String,
    enum: ['Makhana', 'Chips', 'Bites', 'Nuts', 'Seeds'],
    trim: true
  }],
  minOrderAmount: {
    type: Number,
    default: 0,
    min: [0, 'Minimum order amount cannot be negative']
  },
  maxDiscount: {
    type: Number,
    min: [-1, 'Maximum discount cannot be less than -1'],
    default: -1 // -1 means unlimited
  },
  usageLimit: {
    type: Number,
    default: -1, // -1 means unlimited
    min: [-1, 'Usage limit cannot be less than -1']
  },
  usedCount: {
    type: Number,
    default: 0,
    min: [0, 'Used count cannot be negative']
  },
  validFrom: {
    type: Date,
    default: Date.now
  },
  validUntil: {
    type: Date,
    required: [true, 'Valid until date is required']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFirstTimeOnly: {
    type: Boolean,
    default: false
  },
  applicableUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  excludedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
// Note: code index is automatically created by unique: true
couponSchema.index({ isActive: 1 });
couponSchema.index({ validUntil: 1 });
couponSchema.index({ categories: 1 });

// Method to check if coupon is valid
couponSchema.methods.isValid = function() {
  const now = new Date();
  
  // Check if coupon is active
  if (!this.isActive) return false;
  
  // Check if coupon is within valid date range
  if (now < this.validFrom || now > this.validUntil) return false;
  
  // Check if usage limit is reached
  if (this.usageLimit !== -1 && this.usedCount >= this.usageLimit) return false;
  
  return true;
};

// Method to check if coupon can be applied to order
couponSchema.methods.canBeApplied = function(orderAmount, userId = null, isFirstTime = false) {
  // Check basic validity
  if (!this.isValid()) return false;
  
  // Check minimum order amount
  if (orderAmount < this.minOrderAmount) return false;
  
  // Check if it's first time only coupon
  if (this.isFirstTimeOnly && !isFirstTime) return false;
  
  // Check if user is in excluded list
  if (userId && this.excludedUsers.includes(userId)) return false;
  
  // Check if user is in applicable list (if specified)
  if (this.applicableUsers.length > 0 && userId && !this.applicableUsers.includes(userId)) return false;
  
  return true;
};

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function(orderAmount, items = []) {
  let applicableAmount = orderAmount;
  // If coupon is category-specific, only apply to those categories
  if (this.categories && this.categories.length > 0 && items.length > 0) {
    applicableAmount = items
      .filter(item => this.categories.includes(item.category))
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);
  }
  let discountAmount = 0;
  if (this.type === 'percentage') {
    discountAmount = (applicableAmount * this.discount) / 100;
  } else {
    discountAmount = this.discount;
  }
  // Apply maximum discount limit if specified and not unlimited
  if (typeof this.maxDiscount === 'number' && this.maxDiscount !== -1) {
    discountAmount = Math.min(discountAmount, this.maxDiscount);
  }
  // Ensure discount doesn't exceed order amount
  discountAmount = Math.min(discountAmount, applicableAmount);
  return discountAmount;
};

// Method to increment usage count
couponSchema.methods.incrementUsage = function() {
  this.usedCount += 1;
  return this.save();
};

// Virtual for remaining usage
couponSchema.virtual('remainingUsage').get(function() {
  if (this.usageLimit === -1) return 'Unlimited';
  return Math.max(0, this.usageLimit - this.usedCount);
});

// Virtual for validity status
couponSchema.virtual('isExpired').get(function() {
  return new Date() > this.validUntil;
});

// Ensure virtual fields are included in JSON
couponSchema.set('toJSON', { virtuals: true });
couponSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Coupon', couponSchema); 