// Development seed script to insert sample products matching client-side static IDs
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

const products = [
  {
    _clientId: 'makhana01',
    name: 'Peri Peri Makhana',
    description: 'Spicy and tangy roasted makhanas with peri peri seasoning.',
    category: 'Makhana',
    image: '/images/hero-snack-1.jpg',
    sizes: [
      { size: '50g', price: 40, stock: 100 },
      { size: '100g', price: 75, stock: 100 },
      { size: '200g', price: 140, stock: 100 }
    ],
    ingredients: 'Makhana (Fox Nuts), Peri Peri Seasoning, Salt, Spices',
    nutrition: { calories: '120 kcal', protein: '4g', carbs: '20g', fat: '2g', fiber: '3g' },
    featured: true,
    video: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4'
  },
  {
    _clientId: 'makhana02',
    name: 'Masala Makhana',
    description: 'Traditional Indian masala roasted makhanas.',
    category: 'Makhana',
    image: '/images/hero-snack-2.jpg',
    sizes: [
      { size: '50g', price: 35, stock: 100 },
      { size: '100g', price: 65, stock: 100 },
      { size: '200g', price: 120, stock: 100 }
    ],
    ingredients: 'Makhana, Masala, Salt, Turmeric, Spices',
    nutrition: { calories: '110 kcal', protein: '4g', carbs: '18g', fat: '1.5g', fiber: '3g' },
    featured: true,
    video: ''
  },
  {
    _clientId: 'chips01',
    name: 'Baked Potato Chips',
    description: 'Crispy baked potato chips with sea salt.',
    category: 'Chips',
    image: '/images/hero-snack-3.jpg',
    sizes: [
      { size: '50g', price: 45, stock: 100 },
      { size: '100g', price: 85, stock: 100 },
      { size: '200g', price: 160, stock: 100 }
    ],
    ingredients: 'Potatoes, Sea Salt, Olive Oil',
    nutrition: { calories: '130 kcal', protein: '2g', carbs: '25g', fat: '3g', fiber: '2g' },
    featured: true,
    video: 'https://sample-videos.com/zip/10/mp4/SampleVideo_640x360_1mb.mp4'
  }
];

async function seed() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log('Mongo connected:', conn.connection.host);

    for (const p of products) {
      // Try find existing by name
      let existing = await Product.findOne({ name: p.name });
      if (existing) {
        // Ensure sizes have stock
        let updated = false;
        p.sizes.forEach(s => {
          const sizeObj = existing.sizes.find(es => es.size === s.size);
            if (sizeObj && (sizeObj.stock === undefined || sizeObj.stock < 10)) {
              sizeObj.stock = s.stock;
              updated = true;
            }
        });
        if (updated) {
          await existing.save();
          console.log('Updated stock for', p.name);
        } else {
          console.log('Skipped existing', p.name);
        }
        continue;
      }
      await Product.create(p);
      console.log('Inserted', p.name);
    }

    console.log('Seeding done');
    process.exit(0);
  } catch (e) {
    console.error('Seed error', e);
    process.exit(1);
  }
}

seed();
