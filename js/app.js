/* ============================================
   GURUTECH - Shared Utilities
   ============================================ */

const App = {
  // Format price to KES
  formatPrice(price) {
    return 'KES ' + price.toLocaleString('en-KE');
  },

  // Generate star rating HTML
  renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5;
    let html = '';
    for (let i = 0; i < full; i++) html += '★';
    if (half) html += '½';
    for (let i = full + (half ? 1 : 0); i < 5; i++) html += '☆';
    return html;
  },

  // Debounce function
  debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  // Show toast notification
  toast(message, type = 'info') {
    const container = document.querySelector('.toast-container') || (() => {
      const el = document.createElement('div');
      el.className = 'toast-container';
      document.body.appendChild(el);
      return el;
    })();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Mobile menu toggle
  initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const menu = document.querySelector('.mobile-menu');
    const overlay = document.querySelector('.menu-overlay');
    const closeBtn = document.querySelector('.mobile-menu-close');

    if (!menuBtn || !menu) return;

    menuBtn.addEventListener('click', () => {
      menu.classList.add('active');
      overlay?.classList.add('active');
      document.body.style.overflow = 'hidden';
    });

    const close = () => {
      menu.classList.remove('active');
      overlay?.classList.remove('active');
      document.body.style.overflow = '';
    };

    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', close);
  },

  // Unified search functionality
  initSearch() {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    if (!searchInput || !searchBtn) return;

    const doSearch = () => {
      const query = searchInput.value.trim();
      if (query) {
        window.location.href = `products.html?search=${encodeURIComponent(query)}`;
      }
    };

    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  },

  // Update cart count in header — guarded so it's safe even if cart.js isn't loaded yet
  updateCartCount() {
    if (typeof Cart === 'undefined') return;
    const count = Cart.getCount();
    const badge = document.querySelector('.cart-count');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    }
  },

  // Set active nav link
  setActiveNav() {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-links a').forEach(link => {
      link.classList.toggle('active', link.getAttribute('href') === path.split('/').pop());
    });
  },

  // Initialize newsletter form submission
  initNewsletterForm() {
    const form = document.querySelector('.newsletter-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        App.toast('Subscribed!', 'success');
      });
    }
  },

  // Initialize on page load
  init() {
    this.initMobileMenu();
    this.initSearch();
    this.updateCartCount();
    this.setActiveNav();
    this.initNewsletterForm();
  }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());