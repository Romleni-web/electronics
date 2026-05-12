const Products = {
  data: [],
  filtered: [],
  filters: { category: '', brand: [], minPrice: 0, maxPrice: 500000, rating: 0 },
  sort: 'featured',

  async load() {
    try {
      const r = await fetch('/api/products');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const json = await r.json();
      this.data = json.data || [];
      this.filtered = [...this.data];
      return this.data;
    } catch (err) {
      console.error('Products load failed:', err);
      const grids = ['featured-products', 'new-arrivals', 'products-grid'];
      grids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<p style="color:#666;padding:20px">Failed to load products.</p>';
      });
      return [];
    }
  },

  getBrands() { return [...new Set(this.data.map(p => p.brand))].sort(); },
  getCategories() { return [...new Set(this.data.map(p => p.category))].sort(); },

  applyFilters() {
    this.filtered = this.data.filter(p => {
      if (this.filters.category && p.category !== this.filters.category) return false;
      if (this.filters.brand.length && !this.filters.brand.includes(p.brand)) return false;
      if (p.price < this.filters.minPrice) return false;
      if (p.price > this.filters.maxPrice) return false;
      if (this.filters.rating && p.rating < this.filters.rating) return false;
      return true;
    });
    this.sortProducts();
  },

  sortProducts() {
    switch (this.sort) {
      case 'price-low': this.filtered.sort((a, b) => a.price - b.price); break;
      case 'price-high': this.filtered.sort((a, b) => b.price - a.price); break;
      case 'rating': this.filtered.sort((a, b) => b.rating - a.rating); break;
      case 'newest': this.filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); break;
    }
  },

  search(query) {
    if (!query.trim()) return this.data;
    const q = query.toLowerCase();
    return this.data.filter(p => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  },

  getById(id) { return this.data.find(p => p._id === id || p.id === id); },

  getRelated(product, limit = 4) {
    return this.data.filter(p => p.category === product.category && p._id !== product._id && p.id !== product.id).slice(0, limit);
  },

  renderCard(product) {
    const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
    const stockClass = product.stock > 10 ? 'in-stock' : product.stock > 0 ? 'low-stock' : 'out-of-stock';
    const stockText = product.stock > 10 ? 'In Stock' : product.stock > 0 ? 'Only ' + product.stock + ' left' : 'Out of Stock';
    const id = product._id || product.id;
    return '<div class="product-card"><div class="product-card-img">' + (discount > 0 ? '<span class="product-badge">-' + discount + '%</span>' : '') + '<a href="product.html?id=' + id + '"><img src="' + product.image + '" alt="' + product.name + '" loading="lazy"></a></div><div class="product-card-body"><div class="product-brand">' + product.brand + '</div><a href="product.html?id=' + id + '" class="product-name">' + product.name + '</a><div class="product-rating"><span class="stars">' + App.renderStars(product.rating) + '</span><span class="review-count">(' + product.reviews + ')</span></div><div class="product-price"><span class="price-current">' + App.formatPrice(product.price) + '</span>' + (product.oldPrice ? '<span class="price-old">' + App.formatPrice(product.oldPrice) + '</span>' : '') + '</div><div class="stock-status ' + stockClass + '">' + stockText + '</div><button class="btn btn-primary btn-sm" onclick="Cart.add(' + JSON.stringify(product).replace(/"/g, '&quot;') + ')" ' + (product.stock === 0 ? 'disabled' : '') + '>' + (product.stock === 0 ? 'Out of Stock' : 'Add to Cart') + '</button></div></div>';
  },

  renderGrid(containerId, products) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!products?.length) { container.innerHTML = '<p style="color:#666;padding:20px">No products.</p>'; return; }
    container.innerHTML = products.map(p => this.renderCard(p)).join('');
  }
};
