const Cart = {
  items: JSON.parse(localStorage.getItem('gurutech_cart') || '[]'),

  // Only persist lightweight fields — NO image data
  _serialize() {
    return this.items.map(({ id, name, brand, price, quantity, stock }) => ({
      id, name, brand, price, quantity, stock
    }));
  },

  // Re-attach image at render time from Products catalog (if available)
  _getImage(item) {
    if (typeof Products !== 'undefined') {
      const p = Products.getById(item.id);
      if (p) return p.image;
    }
    return 'https://via.placeholder.com/100';
  },

  add(product, quantity = 1) {
    const id = product._id || product.id;
    const existing = this.items.find(i => i.id === id);

    if (existing) {
      if (existing.quantity + quantity > (product.stock || 999)) {
        App.toast('Cannot add more. Only ' + (product.stock || 999) + ' in stock.', 'error');
        return;
      }
      existing.quantity += quantity;
    } else {
      // Store only lightweight fields — no image
      this.items.push({
        id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        quantity,
        stock: product.stock
      });
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

  save() {
    try {
      localStorage.setItem('gurutech_cart', JSON.stringify(this._serialize()));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        // Last resort: clear stale data and retry once
        console.warn('localStorage quota exceeded, clearing old cart data and retrying.');
        localStorage.removeItem('gurutech_cart');
        try {
          localStorage.setItem('gurutech_cart', JSON.stringify(this._serialize()));
        } catch (e2) {
          console.error('Unable to save cart even after clearing:', e2);
          App.toast('Cart could not be saved. Storage is full.', 'error');
        }
      } else {
        throw e;
      }
    }
  },

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

    container.innerHTML = this.items.map(i => {
      const img = this._getImage(i);
      return `<div class="cart-item" data-id="${i.id}">
        <img src="${img}" alt="${i.name}" loading="lazy">
        <div class="cart-item-info"><h4>${i.name}</h4><p>${i.brand}</p></div>
        <div class="cart-item-qty">
          <button class="qty-minus" data-id="${i.id}">-</button>
          <span>${i.quantity}</span>
          <button class="qty-plus" data-id="${i.id}">+</button>
        </div>
        <div class="cart-item-price">${App.formatPrice(i.price * i.quantity)}</div>
        <button class="remove-btn" data-id="${i.id}" aria-label="Remove">x</button>
      </div>`;
    }).join('');

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

document.addEventListener('DOMContentLoaded', () => {
  App.updateCartCount();

  const cartItemsContainer = document.getElementById('cart-items');
  if (cartItemsContainer) {
    cartItemsContainer.addEventListener('click', (e) => {
      const target = e.target;
      const id = target.dataset.id;
      if (!id) return;

      if (target.classList.contains('qty-minus')) {
        const item = Cart.items.find(i => i.id === id);
        if (item) Cart.updateQty(id, item.quantity - 1);
      } else if (target.classList.contains('qty-plus')) {
        const item = Cart.items.find(i => i.id === id);
        if (item) Cart.updateQty(id, item.quantity + 1);
      } else if (target.classList.contains('remove-btn')) {
        Cart.remove(id);
      }
    });
  }
});