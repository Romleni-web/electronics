const express = require('express');
const router = express.Router();
const { Product } = require('../models');
const { verifyAdmin } = require('./auth');

router.get('/', async (req, res) => {
  const { search, category, brand, minPrice, maxPrice, rating, sort, page = 1, limit = 20 } = req.query;
  const query = { active: true };
  if (search) {
    const q = search.toLowerCase();
    query.$or = [
      { name: { $regex: q, $options: 'i' } },
      { brand: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } }
    ];
  }
  if (category) query.category = category;
  if (brand) query.brand = { $in: brand.split(',') };
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseInt(minPrice);
    if (maxPrice) query.price.$lte = parseInt(maxPrice);
  }
  if (rating) query.rating = { $gte: parseFloat(rating) };

  let sortOpt = {};
  if (sort === 'price-low') sortOpt.price = 1;
  else if (sort === 'price-high') sortOpt.price = -1;
  else if (sort === 'rating') sortOpt.rating = -1;
  else if (sort === 'newest') sortOpt.createdAt = -1;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [data, total] = await Promise.all([
    Product.find(query).sort(sortOpt).skip(skip).limit(parseInt(limit)).lean(),
    Product.countDocuments(query)
  ]);

  res.json({ success: true, data, meta: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
});

router.get('/categories/all', async (req, res) => {
  const cats = await Product.distinct('category', { active: true });
  res.json({ success: true, data: cats });
});

router.get('/brands/all', async (req, res) => {
  const brands = await Product.distinct('brand', { active: true });
  res.json({ success: true, data: brands });
});

router.get('/:id', async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: product });
});

router.post('/', verifyAdmin, async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json({ success: true, data: product });
});

router.put('/:id', verifyAdmin, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { ...req.body, updatedAt: new Date() }, { new: true });
  if (!product) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: product });
});

router.delete('/:id', verifyAdmin, async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, { active: false, updatedAt: new Date() });
  if (!product) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, message: 'Product deactivated' });
});

module.exports = router;
