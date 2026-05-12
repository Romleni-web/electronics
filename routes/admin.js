const express = require('express');
const router = express.Router();
const { Order, Product } = require('../models');
const { verifyAdmin, requireRole } = require('./auth');

router.get('/dashboard', verifyAdmin, async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today - 30 * 24 * 60 * 60 * 1000);

  const [todayOrders, weekOrders, monthOrders, totalOrders, products, lowStock] = await Promise.all([
    Order.find({ createdAt: { $gte: today } }),
    Order.find({ createdAt: { $gte: weekAgo } }),
    Order.find({ createdAt: { $gte: monthAgo } }),
    Order.find(),
    Product.countDocuments({ active: true }),
    Product.find({ stock: { $lte: 5 }, active: true }).limit(10)
  ]);

  const revenue = (orders) => orders.reduce((s, o) => s + (o.total || 0), 0);

  res.json({
    success: true,
    data: {
      revenue: {
        today: revenue(todayOrders),
        thisWeek: revenue(weekOrders),
        thisMonth: revenue(monthOrders),
        total: revenue(totalOrders)
      },
      orders: {
        today: todayOrders.length,
        thisWeek: weekOrders.length,
        thisMonth: monthOrders.length,
        total: totalOrders.length
      },
      products: {
        total: products,
        lowStock: lowStock.length
      },
      lowStockProducts: lowStock
    }
  });
});

router.get('/sales-chart', verifyAdmin, async (req, res) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }

  const data = await Promise.all(days.map(async (day) => {
    const nextDay = new Date(day);
    nextDay.setDate(nextDay.getDate() + 1);
    const orders = await Order.find({ createdAt: { $gte: day, $lt: nextDay } });
    return {
      day: day.toLocaleDateString('en-KE', { weekday: 'short' }),
      sales: orders.reduce((s, o) => s + o.total, 0),
      orders: orders.length
    };
  }));

  res.json({ success: true, data });
});

router.post('/products/bulk-update', verifyAdmin, requireRole('superadmin'), async (req, res) => {
  const { updates } = req.body;
  if (!Array.isArray(updates)) return res.status(400).json({ success: false, error: 'Updates array required' });
  const results = await Promise.all(updates.map(u =>
    Product.findByIdAndUpdate(u.id, { ...u, updatedAt: new Date() }, { new: true })
  ));
  res.json({ success: true, updated: results.filter(Boolean).length });
});

router.post('/orders/bulk-status', verifyAdmin, async (req, res) => {
  const { orderNumbers, status } = req.body;
  if (!Array.isArray(orderNumbers) || !status) return res.status(400).json({ success: false, error: 'orderNumbers and status required' });
  const result = await Order.updateMany(
    { number: { $in: orderNumbers } },
    { status, updatedAt: new Date() }
  );
  res.json({ success: true, updated: result.modifiedCount });
});

router.get('/reports/sales', verifyAdmin, async (req, res) => {
  const { startDate, endDate } = req.query;
  const query = {};
  if (startDate && endDate) {
    query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  const [orders, byCategory] = await Promise.all([
    Order.find(query),
    Order.aggregate([
      { $match: query },
      { $unwind: '$items' },
      { $group: { _id: '$items.category', total: { $sum: { $multiply: ['$items.price', '$items.quantity'] } } } }
    ])
  ]);

  const totalSales = orders.reduce((s, o) => s + o.total, 0);
  const categoryMap = {};
  byCategory.forEach(c => categoryMap[c._id || 'other'] = c.total);

  res.json({
    success: true,
    data: {
      period: { startDate, endDate },
      totalSales,
      totalOrders: orders.length,
      averageOrderValue: orders.length ? Math.round(totalSales / orders.length) : 0,
      salesByCategory: categoryMap
    }
  });
});

module.exports = router;
