const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Admin, Audit } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRE = process.env.JWT_EXPIRE || '8h';
const BCRYPT_SALT = 12;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30 * 60 * 1000;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET >= 32 chars required');
  process.exit(1);
}

const cookieCfg = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 * 1000,
  path: '/'
};

function extractToken(req) {
  if (req.cookies?.admin_token) return req.cookies.admin_token;
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

async function verifyAdmin(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.adminId);
    if (!admin || !admin.active) return res.status(401).json({ success: false, error: 'Account inactive' });
    req.admin = { id: admin._id.toString(), email: admin.email, name: admin.name, role: admin.role };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ success: false, error: 'Session expired' });
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ success: false, error: 'Auth required' });
    if (req.admin.role !== role && req.admin.role !== 'superadmin') return res.status(403).json({ success: false, error: 'Access denied' });
    next();
  };
}

async function logAudit(action, adminId, details = {}) {
  await Audit.create({ action, adminId, details, ip: details.ip, userAgent: details.ua });
}

async function initDefaultAdmin() {
  const count = await Admin.countDocuments();
  if (count > 0) return;
  const email = process.env.ADMIN_EMAIL;
  const pass = process.env.ADMIN_PASSWORD;
  if (!email || !pass) {
    console.error('FATAL: ADMIN_EMAIL and ADMIN_PASSWORD required for first setup');
    process.exit(1);
  }
  const hashed = await bcrypt.hash(pass, BCRYPT_SALT);
  await Admin.create({ email, password: hashed, name: 'System Admin', role: 'superadmin' });
  console.log('Default admin created');
}

router.post('/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { success: false, error: 'Too many attempts' } }), async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
  const admin = await Admin.findOne({ email });
  if (!admin) {
    await bcrypt.compare('dummy', '$2a$12$abcdefghijklmnopqrstuu');
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  if (admin.lockedUntil && new Date() < admin.lockedUntil) {
    const mins = Math.ceil((admin.lockedUntil - new Date()) / 60000);
    return res.status(423).json({ success: false, error: 'Account locked for ' + mins + ' mins' });
  }
  const valid = await bcrypt.compare(password, admin.password);
  if (!valid) {
    admin.loginAttempts = (admin.loginAttempts || 0) + 1;
    if (admin.loginAttempts >= MAX_ATTEMPTS) {
      admin.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
      admin.loginAttempts = 0;
      await admin.save();
      logAudit('locked', admin._id, { ip: req.ip });
      return res.status(423).json({ success: false, error: 'Account locked for 30 mins' });
    }
    await admin.save();
    logAudit('fail', admin._id, { ip: req.ip, attempts: admin.loginAttempts });
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
  admin.loginAttempts = 0;
  admin.lockedUntil = null;
  admin.lastLogin = new Date();
  await admin.save();
  const token = jwt.sign({ adminId: admin._id.toString(), email: admin.email, role: admin.role }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
  logAudit('login', admin._id, { ip: req.ip, ua: req.headers['user-agent'] });
  res.cookie('admin_token', token, cookieCfg);
  res.json({ success: true, data: { admin: { id: admin._id, email: admin.email, name: admin.name, role: admin.role } } });
});

router.post('/admin/logout', verifyAdmin, async (req, res) => {
  logAudit('logout', req.admin.id, { ip: req.ip });
  res.clearCookie('admin_token', { path: '/', httpOnly: true, sameSite: 'strict' });
  res.json({ success: true, message: 'Logged out' });
});

router.get('/admin/me', verifyAdmin, (req, res) => {
  res.json({ success: true, data: { admin: req.admin } });
});

router.post('/admin/create', verifyAdmin, requireRole('superadmin'), async (req, res) => {
  const { email, password, name, role = 'admin' } = req.body;
  if (!email || !password || !name) return res.status(400).json({ success: false, error: 'All fields required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: 'Invalid email' });
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({ success: false, error: 'Password must be 8+ chars with upper, lower, number' });
  }
  if (await Admin.findOne({ email })) return res.status(409).json({ success: false, error: 'Email exists' });
  if (!['admin', 'superadmin'].includes(role)) return res.status(400).json({ success: false, error: 'Invalid role' });
  const hashed = await bcrypt.hash(password, BCRYPT_SALT);
  const newAdmin = await Admin.create({ email, password: hashed, name, role, createdBy: req.admin.id });
  logAudit('create', req.admin.id, { target: newAdmin._id.toString() });
  res.status(201).json({ success: true, data: { admin: { id: newAdmin._id, email, name, role, createdAt: newAdmin.createdAt } } });
});

router.put('/admin/password', verifyAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'Both passwords required' });
  const admin = await Admin.findById(req.admin.id);
  const valid = await bcrypt.compare(currentPassword, admin.password);
  if (!valid) return res.status(401).json({ success: false, error: 'Current password wrong' });
  if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Password too short' });
  admin.password = await bcrypt.hash(newPassword, BCRYPT_SALT);
  await admin.save();
  logAudit('passchange', admin._id, { ip: req.ip });
  res.clearCookie('admin_token', { path: '/', httpOnly: true, sameSite: 'strict' });
  res.json({ success: true, message: 'Password changed. Login again.' });
});

router.get('/admin/audit-log', verifyAdmin, requireRole('superadmin'), async (req, res) => {
  const logs = await Audit.find().sort({ timestamp: -1 }).limit(parseInt(req.query.limit || 100));
  res.json({ success: true, data: logs });
});

router.get('/admin/list', verifyAdmin, requireRole('superadmin'), async (req, res) => {
  const admins = await Admin.find().select('-password').sort({ createdAt: -1 });
  res.json({ success: true, data: admins });
});

router.put('/admin/:id/toggle', verifyAdmin, requireRole('superadmin'), async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) return res.status(404).json({ success: false, error: 'Not found' });
  if (admin._id.toString() === req.admin.id) return res.status(400).json({ success: false, error: 'Cannot self-toggle' });
  admin.active = !admin.active;
  await admin.save();
  logAudit('toggle', req.admin.id, { target: admin._id.toString(), active: admin.active });
  res.json({ success: true, data: { id: admin._id, active: admin.active } });
});

module.exports = router;
module.exports.verifyAdmin = verifyAdmin;
module.exports.requireRole = requireRole;
module.exports.initDefaultAdmin = initDefaultAdmin;
