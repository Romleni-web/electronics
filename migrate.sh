#!/bin/bash
# GURUTECH Production Migration Script

echo "=== GURUTECH Production Setup ==="

# Backup
mkdir -p backup
mv server.js backup/ 2>/dev/null
mv routes/*.js backup/ 2>/dev/null
cp js/*.js backup/ 2>/dev/null
cp admin-*.html backup/ 2>/dev/null
echo "[1/6] Backup created"

# Extract
unzip -o gurutech-production.zip
echo "[2/6] Files extracted"

# Install deps
npm install
echo "[3/6] Dependencies installed"

# Setup env
if [ ! -f .env ]; then
    cp .env.example .env
    echo "[4/6] .env created - EDIT THIS FILE WITH YOUR VALUES"
else
    echo "[4/6] .env already exists"
fi

# Seed DB
read -p "Seed products to MongoDB? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run seed
    echo "[5/6] Database seeded"
else
    echo "[5/6] Skipped seeding"
fi

echo "[6/6] Done! Run: npm start"
echo ""
echo "IMPORTANT: Edit .env with your:"
echo "  - MONGODB_URI"
echo "  - JWT_SECRET (64+ chars)"
echo "  - ADMIN_EMAIL / ADMIN_PASSWORD"
echo "  - MPESA credentials (for payments)"
