const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gurutech';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => { console.error('MongoDB error:', err); process.exit(1); });

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https://via.placeholder.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://api.safaricom.co.ke", "https://sandbox.safaricom.co.ke"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  xFrameOptions: { action: 'deny' },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } }));
app.use('/api/auth/', rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: { error: 'Too many auth attempts' } }));

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const mpesaRoutes = require('./routes/mpesa');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/admin', adminRoutes);

// Init default admin
const { initDefaultAdmin } = require('./routes/auth');
initDefaultAdmin().catch(console.error);

// Static files
app.use(express.static(path.join(__dirname)));

// HTML routes
const pages = ['', 'products', 'product', 'cart', 'checkout', 'order-success',
  'admin-login', 'admin-dashboard', 'admin-orders', 'admin-products', 'admin-customers'];
pages.forEach(p => {
  const route = p === '' ? '/' : '/' + p;
  const file = p === '' ? 'index.html' : p + '.html';
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, file)));
});

// Errors
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '404.html'));
});

app.listen(PORT, () => {
  console.log('GURUTECH [' + NODE_ENV + '] on port ' + PORT);
});

module.exports = app;
