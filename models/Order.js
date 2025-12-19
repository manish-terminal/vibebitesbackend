const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true,
    // generated in pre-save hook; don't require upfront to let hook run
    required: false
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    size: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price cannot be negative']
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1']
    },
    image: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true
    }
  }],
  shippingAddress: {
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    address: {
      type: String,
      required: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      required: true,
      trim: true
    },
    pincode: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      trim: true
    }
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['card', 'cod', 'upi', 'netbanking', 'razorpay'],
    default: 'card'
  },
  paymentStatus: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    required: true,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
    default: 'pending'
  },
  subtotal: {
    type: Number,
    required: true,
    min: [0, 'Subtotal cannot be negative']
  },
  shippingCost: {
    type: Number,
    default: 0,
    min: [0, 'Shipping cost cannot be negative']
  },
  discount: {
    type: Number,
    default: 0,
    min: [0, 'Discount cannot be negative']
  },
  total: {
    type: Number,
    required: true,
    min: [0, 'Total cannot be negative']
  },
  appliedCoupon: {
    code: {
      type: String,
      trim: true
    },
    discount: {
      type: Number,
      min: [0, 'Discount cannot be negative']
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed']
    }
  },
  paymentDetails: {
    transactionId: String,
    paymentIntentId: String,
    paymentMethod: String,
    paidAt: Date
  },
  shippingDetails: {
    trackingNumber: String,
    carrier: String,
    shippedAt: Date,
    estimatedDelivery: Date,
    deliveredAt: Date
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  cancelRequest: {
    requestedAt: Date,
    reason: {
      type: String,
      enum: ['changed_mind', 'wrong_item', 'defective', 'late_delivery', 'other'],
      trim: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    processedAt: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  returnRequest: {
    requestedAt: Date,
    reason: {
      type: String,
      enum: ['defective', 'wrong_item', 'not_as_described', 'changed_mind', 'other'],
      trim: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    processedAt: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    returnTrackingNumber: String,
    refundAmount: Number,
    refundMethod: {
      type: String,
      enum: ['original_payment', 'store_credit', 'bank_transfer']
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
// Note: orderNumber index is automatically created by unique: true
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

// Generate order number before saving
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Get count of orders for today
    const todayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    
    const orderCount = await this.constructor.countDocuments({
      createdAt: { $gte: todayStart, $lt: todayEnd }
    });
    
  this.orderNumber = `VB${year}${month}${day}${String(orderCount + 1).padStart(4, '0')}`;
  }
  next();
});

// Virtual for order summary
orderSchema.virtual('orderSummary').get(function() {
  return {
    orderNumber: this.orderNumber,
    totalItems: Array.isArray(this.items)
      ? this.items.reduce((sum, item) => sum + item.quantity, 0)
      : 0,
    totalAmount: this.total,
    status: this.orderStatus,
    paymentStatus: this.paymentStatus
  };
});

// Method to calculate totals
orderSchema.methods.calculateTotals = function() {
  this.subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // Calculate shipping cost based on threshold
  const config = require('../config/config');
  this.shippingCost = this.subtotal >= config.freeShippingThreshold ? 0 : config.shippingFee;
  
  // Apply discount if coupon is applied
  let discountAmount = 0;
  if (this.appliedCoupon && this.appliedCoupon.code) {
    if (this.appliedCoupon.type === 'percentage') {
      discountAmount = (this.subtotal * this.appliedCoupon.discount) / 100;
    } else {
      discountAmount = this.appliedCoupon.discount;
    }
  }
  
  this.discount = Math.min(discountAmount, this.subtotal);
  this.total = this.subtotal + this.shippingCost - this.discount;
  
  return {
    subtotal: this.subtotal,
    shippingCost: this.shippingCost,
    discount: this.discount,
    total: this.total
  };
};

// Method to update order status
orderSchema.methods.updateStatus = function(newStatus, notes = '') {
  this.orderStatus = newStatus;
  if (notes) {
    this.notes = notes;
  }
  
  // Update timestamps based on status
  switch (newStatus) {
    case 'shipped':
      this.shippingDetails.shippedAt = new Date();
      break;
    case 'delivered':
      this.shippingDetails.deliveredAt = new Date();
      break;
  }
  
  return this.save();
};

// Method to update payment status
orderSchema.methods.updatePaymentStatus = function(newStatus, paymentDetails = {}) {
  this.paymentStatus = newStatus;
  
  if (newStatus === 'completed' && paymentDetails) {
    this.paymentDetails = { ...this.paymentDetails, ...paymentDetails, paidAt: new Date() };
  }
  
  return this.save();
};

// Method to request order cancellation
orderSchema.methods.requestCancellation = function(reason, description = '') {
  // Only allow cancellation for pending, confirmed, or processing orders
  if (!['pending', 'confirmed', 'processing'].includes(this.orderStatus)) {
    throw new Error('Order cannot be cancelled at this stage');
  }

  this.cancelRequest = {
    requestedAt: new Date(),
    reason,
    description,
    status: 'pending'
  };

  return this.save();
};

// Method to request order return
orderSchema.methods.requestReturn = function(reason, description = '') {
  // Only allow returns for delivered orders
  if (this.orderStatus !== 'delivered') {
    throw new Error('Returns can only be requested for delivered orders');
  }

  this.returnRequest = {
    requestedAt: new Date(),
    reason,
    description,
    status: 'pending'
  };

  return this.save();
};

// Method to process cancel request (Admin only)
orderSchema.methods.processCancelRequest = function(approved, processedBy, notes = '') {
  if (!this.cancelRequest || this.cancelRequest.status !== 'pending') {
    throw new Error('No pending cancellation request found');
  }

  this.cancelRequest.status = approved ? 'approved' : 'rejected';
  this.cancelRequest.processedAt = new Date();
  this.cancelRequest.processedBy = processedBy;

  if (approved) {
    this.orderStatus = 'cancelled';
    this.paymentStatus = 'refunded';
  }

  if (notes) {
    this.notes = notes;
  }

  return this.save();
};

// Method to process return request (Admin only)
orderSchema.methods.processReturnRequest = function(approved, processedBy, refundAmount, refundMethod, returnTrackingNumber = '', notes = '') {
  if (!this.returnRequest || this.returnRequest.status !== 'pending') {
    throw new Error('No pending return request found');
  }

  this.returnRequest.status = approved ? 'approved' : 'rejected';
  this.returnRequest.processedAt = new Date();
  this.returnRequest.processedBy = processedBy;

  if (approved) {
    this.orderStatus = 'returned';
    this.returnRequest.returnTrackingNumber = returnTrackingNumber;
    this.returnRequest.refundAmount = refundAmount;
    this.returnRequest.refundMethod = refundMethod;
  }

  if (notes) {
    this.notes = notes;
  }

  return this.save();
};

// Ensure virtual fields are included in JSON
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema); 