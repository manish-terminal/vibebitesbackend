const mongoose = require('mongoose');

// Category schema kept independent so existing Product enum isn't modified.
// Adding new categories here will not automatically allow them in Product.category
// until the Product schema enum is updated (intentionally untouched per requirements).
const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Category name cannot exceed 50 characters']
  },
  slug: {
    type: String,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [300, 'Description cannot exceed 300 characters']
  },
  image: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

categorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  }
  next();
});

// Note: name and slug indexes are automatically created by unique: true
categorySchema.index({ isActive: 1 });

module.exports = mongoose.model('Category', categorySchema);
