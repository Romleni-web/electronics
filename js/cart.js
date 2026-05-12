const Cart = {
  items: JSON.parse(localStorage.getItem('gurutech_cart') || '[]'),

  add(product, quantity = 1) {
    const id = product._id || product.id;
    const existing = this.items.find(i => i.id === id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.items.push({ id, name: product.name, brand: product.brand, price: product.price, image: product.image, quantity, stock: product.stock });
    }
    this.save();
    App.updateCartCount();
    App.toast(product.name + ' added to cart', 'success');
  },

  remove(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.save();
    App.updateCartCount();
    this.renderPage();
  },

  updateQty(id, quantity) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    if (quantity <= 0) { this.remove(id); return; }
    if (quantity > item.stock) { App.toast('Only ' + item.stock + ' available', 'error'); return; }
    item.quantity = quantity;
    this.save();
    this.renderPage();
  },

  getCount() { return this.items.reduce((s, i) => s + i.quantity, 0); },
  getTotal() { return this.items.reduce((s, i) => s + i.price * i.quantity, 0); },
  getShipping() { return this.getTotal() >= 50000 ? 0 : 500; },

  clear() {
    this.items = [];
    this.save();
    App.updateCartCount();
  },

  save() { localStorage.setItem('gurutech_cart', JSON.stringify(this.items)); },

  renderPage() {
    const container = document.getElementById('cart-items');
    const empty = document.getElementById('empty-cart');
    const content = document.getElementById('cart-content');
    if (!container) return;
    if (!this.items.length) {
      if (empty) empty.classList.remove('hidden');
      if (content) content.classList.add('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    container.innerHTML = this.items.map(i => '<div class="cart-item" data-id="' + i.id + '"><img src="' + i.image + '" alt="' + i.name + '" loading="lazy"><div class="cart-item-info"><h4>' + i.name + '</h4><p>' + i.brand + '</p></div><div class="cart-item-qty"><button onclick="Cart.updateQty(\'' + i.id + '\', ' + (i.quantity - 1) + ')">-</button><span>' + i.quantity + '</span><button onclick="Cart.updateQty(\'' + i.id + '\', ' + (i.quantity + 1) + ')">+</button></div><div class="cart-item-price">' + App.formatPrice(i.price * i.quantity) + '</div><button class="remove-btn" onclick="Cart.remove(\'' + i.id + '\')" aria-label="Remove">x</button></div>').join('');
    const subtotal = this.getTotal();
    const shipping = this.getShipping();
    const total = subtotal + shipping;
    const subEl = document.getElementById('cart-subtotal');
    const shipEl = document.getElementById('cart-shipping');
    const totEl = document.getElementById('cart-total');
    if (subEl) subEl.textContent = App.formatPrice(subtotal);
    if (shipEl) shipEl.textContent = shipping === 0 ? 'FREE' : App.formatPrice(shipping);
    if (totEl) totEl.textContent = App.formatPrice(total);
  }
};

document.addEventListener('DOMContentLoaded', () => App.updateCartCount());
