const express = require('express');
const router = express.Router();
const { Order, Product } = require('../models');
const { verifyAdmin } = require('./auth');

function generateOrderNumber() {
  return 'GT' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
}

router.get('/', verifyAdmin, async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const query = {};
  if (status) query.status = status;
  if (search) {
    query.$or = [
      { number: { $regex: search, $options: 'i' } },
      { 'customer.name': { $regex: search, $options: 'i' } },
      { 'customer.email': { $regex: search, $options: 'i' } }
    ];
  }
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [data, total] = await Promise.all([
    Order.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Order.countDocuments(query)
  ]);
  res.json({ success: true, data, meta: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
});

router.get('/stats/overview', verifyAdmin, async (req, res) => {
  const [total, totalRevenue, byStatus] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([{ $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);
  const statusMap = {};
  byStatus.forEach(s => statusMap[s._id || 'pending'] = s.count);
  res.json({ success: true, data: { total, totalRevenue: totalRevenue[0]?.total || 0, byStatus: statusMap } });
});

router.get('/:number', async (req, res) => {
  const order = await Order.findOne({ number: req.params.number }).lean();
  if (!order) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: order });
});

router.post('/', async (req, res) => {
  const { items, customer, paymentMethod = 'mpesa', shipping = 0 } = req.body;
  if (!items?.length || !customer?.email || !customer?.phone || !customer?.name) {
    return res.status(400).json({ success: false, error: 'Items and customer details required' });
  }

  // Validate stock
  for (const item of items) {
    const product = await Product.findById(item.productId);
    if (!product) return res.status(400).json({ success: false, error: 'Product not found: ' + item.productId });
    if (product.stock < item.quantity) return res.status(400).json({ success: false, error: 'Insufficient stock for ' + product.name });
  }

  // Deduct stock
  for (const item of items) {
    await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } });
  }

  const total = items.reduce((s, i) => s + (i.price * i.quantity), 0);
  const order = await Order.create({
    number: generateOrderNumber(),
    items,
    total,
    shipping,
    customer,
    paymentMethod,
    status: 'pending',
    paymentStatus: 'pending'
  });

  res.status(201).json({ success: true, data: order });
});

router.put('/:number/status', verifyAdmin, async (req, res) => {
  const { status, paymentStatus } = req.body;
  const order = await Order.findOneAndUpdate(
    { number: req.params.number },
    { status: status || undefined, paymentStatus: paymentStatus || undefined, updatedAt: new Date() },
    { new: true }
  );
  if (!order) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, data: order });
});

router.delete('/:number', verifyAdmin, async (req, res) => {
  const order = await Order.findOneAndDelete({ number: req.params.number });
  if (!order) return res.status(404).json({ success: false, error: 'Not found' });
  // Restore stock
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
  }
  res.json({ success: true, message: 'Order deleted' });
});

module.exports = router;
