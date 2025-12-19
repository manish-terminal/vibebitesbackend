const express = require('express');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const router = express.Router();

// Add product to wishlist
router.post('/add', protect, async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ success: false, message: 'Product ID required' });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!user.wishlist.includes(productId)) {
      user.wishlist.push(productId);
      await user.save();
    }
    res.json({ success: true, message: 'Added to wishlist' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error updating wishlist' });
  }
});

// Remove product from wishlist
router.post('/remove', protect, async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ success: false, message: 'Product ID required' });
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.wishlist = user.wishlist.filter(id => id.toString() !== productId);
    await user.save();
    res.json({ success: true, message: 'Removed from wishlist' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error updating wishlist' });
  }
});

// Get user's wishlist
router.get('/', protect, async (req, res) => {
  const userId = req.user._id;
  try {
    const user = await User.findById(userId).populate('wishlist');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { wishlist: user.wishlist } });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Error fetching wishlist' });
  }
});

module.exports = router;
