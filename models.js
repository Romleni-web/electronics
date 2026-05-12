const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String, required: true },
  brand: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  oldPrice: Number,
  stock: { type: Number, required: true, min: 0, default: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviews: { type: Number, default: 0 },
  image: { type: String, default: 'https://via.placeholder.com/400' },
  specs: { type: Map, of: String, default: {} },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const orderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: String,
  brand: String,
  price: Number,
  image: String,
  quantity: { type: Number, required: true, min: 1 }
});

const orderSchema = new mongoose.Schema({
  number: { type: String, unique: true, required: true },
  items: [orderItemSchema],
  total: { type: Number, required: true },
  shipping: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  paymentStatus: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
  paymentMethod: { type: String, enum: ['mpesa', 'cod'], default: 'mpesa' },
  mpesaReceipt: String,
  checkoutRequestId: String,
  customer: {
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: String,
    city: String,
    county: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const adminSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' },
  active: { type: Boolean, default: true },
  loginAttempts: { type: Number, default: 0 },
  lockedUntil: Date,
  lastLogin: Date,
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
});

const auditSchema = new mongoose.Schema({
  action: { type: String, required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  targetId: String,
  details: { type: Map, of: String },
  ip: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = {
  Product: mongoose.model('Product', productSchema),
  Order: mongoose.model('Order', orderSchema),
  Admin: mongoose.model('Admin', adminSchema),
  Audit: mongoose.model('Audit', auditSchema)
};
