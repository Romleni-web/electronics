const Checkout = {
  init() {
    this.renderSummary();
    this.initPayment();
    this.initForm();
    this.initMpesa();
  },

  renderSummary() {
    const container = document.getElementById('checkout-items');
    const subtotalEl = document.getElementById('checkout-subtotal');
    const shippingEl = document.getElementById('checkout-shipping');
    const totalEl = document.getElementById('checkout-total');
    if (!container) return;
    const items = Cart.items;
    if (!items.length) { window.location.href = 'cart.html'; return; }
    container.innerHTML = items.map(i => '<div class="order-item"><img src="' + i.image + '" alt="' + i.name + '"><div class="order-item-info"><h4>' + i.name + '</h4><p>Qty: ' + i.quantity + ' x ' + App.formatPrice(i.price) + '</p></div></div>').join('');
    const subtotal = Cart.getTotal();
    const shipping = Cart.getShipping();
    if (subtotalEl) subtotalEl.textContent = App.formatPrice(subtotal);
    if (shippingEl) shippingEl.textContent = shipping === 0 ? 'FREE' : App.formatPrice(shipping);
    if (totalEl) totalEl.textContent = App.formatPrice(subtotal + shipping);
  },

  initPayment() {
    document.querySelectorAll('.payment-method').forEach(m => {
      m.addEventListener('click', () => {
        document.querySelectorAll('.payment-method').forEach(x => x.classList.remove('active'));
        m.classList.add('active');
        m.querySelector('input').checked = true;
        const mpesa = document.getElementById('mpesa-section');
        if (mpesa) mpesa.style.display = m.dataset.method === 'mpesa' ? 'block' : 'none';
      });
    });
  },

  initForm() {
    const form = document.getElementById('checkout-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.validate()) this.submitOrder();
    });
  },

  validate() {
    let ok = true;
    document.querySelectorAll('#checkout-form input[required], #checkout-form select[required]').forEach(f => {
      const err = f.parentElement.querySelector('.error-msg');
      let bad = !f.value.trim();
      if (f.type === 'email' && !bad && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value)) bad = true;
      if (f.id === 'phone' && !bad && !/^\+?254[0-9]{9}$/.test(f.value.replace(/\s/g,''))) bad = true;
      f.classList.toggle('error', bad);
      if (err) err.classList.toggle('show', bad);
      if (bad) ok = false;
    });
    return ok;
  },

  initMpesa() {
    const btn = document.getElementById('stk-push-btn');
    if (!btn) return;
    btn.addEventListener('click', () => this.stkPush());
  },

  async stkPush() {
    const phoneInput = document.getElementById('mpesa-phone');
    const status = document.getElementById('stk-status');
    const btn = document.getElementById('stk-push-btn');
    let phone = (phoneInput?.value || '').trim().replace(/\s/g,'');
    if (!phone) { App.toast('Enter M-Pesa number', 'error'); return; }
    if (phone.startsWith('0')) phone = '+254' + phone.substring(1);
    if (phone.startsWith('254')) phone = '+' + phone;
    if (!phone.startsWith('+254')) { App.toast('Invalid Kenyan number', 'error'); return; }

    const amount = Cart.getTotal() + Cart.getShipping();
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Sending...';
    status.className = 'stk-status pending show';
    status.innerHTML = '<span class="spinner"></span>STK Push sent. Check your phone...';

    try {
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: Cart.items.map(i => ({ productId: i.id, name: i.name, brand: i.brand, price: i.price, image: i.image, quantity: i.quantity })),
          customer: {
            name: document.getElementById('fullName')?.value,
            email: document.getElementById('email')?.value,
            phone: document.getElementById('phone')?.value,
            address: document.getElementById('address')?.value,
            city: document.getElementById('city')?.value,
            county: document.getElementById('county')?.value
          },
          paymentMethod: 'mpesa',
          shipping: Cart.getShipping()
        })
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || 'Order failed');

      const mpesaRes = await fetch('/api/mpesa/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone, amount: amount, orderNumber: orderData.data.number })
      });
      const mpesaData = await mpesaRes.json();
      if (!mpesaRes.ok) throw new Error(mpesaData.error || 'M-Pesa failed');

      status.className = 'stk-status success show';
      status.innerHTML = 'M-Pesa request sent. Enter PIN on your phone.';
      btn.innerHTML = 'Check your phone';

      // Poll for payment status
      this.pollPayment(orderData.data.number, mpesaData.data.checkoutRequestId);
    } catch (err) {
      status.className = 'stk-status error show';
      status.innerHTML = 'Error: ' + err.message;
      btn.disabled = false;
      btn.innerHTML = 'Retry M-Pesa';
    }
  },

  async pollPayment(orderNumber, checkoutRequestId) {
    let attempts = 0;
    const maxAttempts = 30;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch('/api/orders/' + orderNumber);
        const data = await r.json();
        if (data.data?.paymentStatus === 'completed') {
          clearInterval(interval);
          Cart.clear();
          localStorage.setItem('last_order', JSON.stringify(data.data));
          window.location.href = 'order-success.html';
          return;
        }
        if (data.data?.paymentStatus === 'failed' || attempts >= maxAttempts) {
          clearInterval(interval);
          document.getElementById('stk-status').className = 'stk-status error show';
          document.getElementById('stk-status').innerHTML = attempts >= maxAttempts ? 'Payment timeout. Check M-Pesa and try again.' : 'Payment failed.';
          document.getElementById('stk-push-btn').disabled = false;
          document.getElementById('stk-push-btn').innerHTML = 'Retry M-Pesa';
        }
      } catch(e) {}
    }, 3000);
  },

  async submitOrder() {
    const method = document.querySelector('input[name="payment"]:checked')?.value || 'mpesa';
    if (method === 'cod') {
      try {
        const r = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: Cart.items.map(i => ({ productId: i.id, name: i.name, brand: i.brand, price: i.price, image: i.image, quantity: i.quantity })),
            customer: {
              name: document.getElementById('fullName')?.value,
              email: document.getElementById('email')?.value,
              phone: document.getElementById('phone')?.value,
              address: document.getElementById('address')?.value,
              city: document.getElementById('city')?.value,
              county: document.getElementById('county')?.value
            },
            paymentMethod: 'cod',
            shipping: Cart.getShipping()
          })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        Cart.clear();
        localStorage.setItem('last_order', JSON.stringify(data.data));
        window.location.href = 'order-success.html';
      } catch(err) {
        App.toast(err.message, 'error');
      }
    }
  }
};
