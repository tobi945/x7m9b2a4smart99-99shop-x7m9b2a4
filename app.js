'use strict';

// מחלקת מוצר: שומרת את כל המידע על פריט אחד ברשימה.
class Product {
  constructor(id, name, category, quantity = 1, isBought = false) {
    this.id = id;
    this.name = name;
    this.category = category;
    this.quantity = Number.isFinite(Number(quantity)) ? Math.max(1, Number(quantity)) : 1;
    this.isBought = Boolean(isBought);
  }

  toggleStatus() {
    this.isBought = !this.isBought;
  }
}

// הבקר הראשי של האפליקציה: נתונים, שמירה, אירועים ורינדור למסך.
class AppManager {
  constructor() {
    this.storageKey = 'smart_shop_products_v1';
    this.categories = [
      { id: 'fruits_vegetables', name: 'פירות וירקות', icon: '🥦' },
      { id: 'dairy_eggs', name: 'חלב וביצים', icon: '🥛' },
      { id: 'bakery', name: 'לחם ומאפים', icon: '🍞' },
      { id: 'meat_fish', name: 'בשר ודגים', icon: '🥩' },
      { id: 'pantry', name: 'מזווה ושימורים', icon: '🥫' },
      { id: 'cleaning', name: 'ניקיון וטואלטיקה', icon: '🧴' },
      { id: 'other', name: 'שונות', icon: '📦' },
    ];
    this.products = [];
    this.elements = {};

    this.cacheDom();
    this.loadData();
    this.populateCategories();
    this.bindEvents();
    this.render();
    this.registerServiceWorker();
  }

  cacheDom() {
    this.elements.categoriesContainer = document.getElementById('categoriesContainer');
    this.elements.emptyState = document.getElementById('emptyState');
    this.elements.summaryStrip = document.getElementById('summaryStrip');
    this.elements.summaryTotal = document.getElementById('summaryTotal');
    this.elements.summaryBought = document.getElementById('summaryBought');
    this.elements.summaryLeft = document.getElementById('summaryLeft');
    this.elements.shareButton = document.getElementById('shareWhatsAppButton');
    this.elements.modal = document.getElementById('productModal');
    this.elements.form = document.getElementById('productForm');
    this.elements.nameInput = document.getElementById('productName');
    this.elements.categorySelect = document.getElementById('productCategory');
    this.elements.quantityInput = document.getElementById('productQuantity');
  }

  bindEvents() {
    document.getElementById('openProductModal').addEventListener('click', () => this.openModal());
    document.getElementById('emptyAddButton').addEventListener('click', () => this.openModal());
    document.getElementById('closeProductModal').addEventListener('click', () => this.closeModal());
    document.getElementById('cancelProductButton').addEventListener('click', () => this.closeModal());
    this.elements.shareButton.addEventListener('click', () => this.openWhatsAppShare());

    this.elements.modal.addEventListener('click', (event) => {
      if (event.target === this.elements.modal) {
        this.closeModal();
      }
    });

    this.elements.form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleProductSubmit();
    });

    this.elements.categoriesContainer.addEventListener('change', (event) => {
      const checkbox = event.target.closest('[data-action="toggle-product"]');
      if (checkbox) {
        this.toggleProduct(checkbox.dataset.id);
      }
    });

    this.elements.categoriesContainer.addEventListener('click', (event) => {
      const deleteButton = event.target.closest('[data-action="delete-product"]');
      if (deleteButton) {
        this.deleteProduct(deleteButton.dataset.id);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.elements.modal.hidden) {
        this.closeModal();
      }
    });
  }

  populateCategories() {
    this.elements.categorySelect.innerHTML = this.categories
      .map((category) => `<option value="${this.escapeHtml(category.id)}">${this.escapeHtml(category.name)}</option>`)
      .join('');
  }

  loadData() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      const parsed = saved ? JSON.parse(saved) : [];
      this.products = parsed.map((item) => new Product(
        item.id,
        item.name,
        item.category,
        item.quantity,
        item.isBought
      ));
    } catch (error) {
      console.warn('לא ניתן היה לטעון את הרשימה מהדפדפן.', error);
      this.products = [];
    }
  }

  saveData() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.products));
  }

  addProduct(name, category, quantity) {
    const product = new Product(
      this.createId(),
      name.trim(),
      category,
      quantity,
      false
    );

    this.products.unshift(product);
    this.saveData();
    this.render();
  }

  deleteProduct(id) {
    this.products = this.products.filter((product) => product.id !== id);
    this.saveData();
    this.render();
  }

  toggleProduct(id) {
    const product = this.products.find((item) => item.id === id);
    if (!product) {
      return;
    }

    product.toggleStatus();
    this.saveData();
    this.render();
  }

  handleProductSubmit() {
    const name = this.elements.nameInput.value.trim();
    const category = this.elements.categorySelect.value;
    const quantity = Number(this.elements.quantityInput.value);

    if (!name) {
      this.markInvalid(this.elements.nameInput);
      return;
    }

    if (!category) {
      this.markInvalid(this.elements.categorySelect);
      return;
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      this.markInvalid(this.elements.quantityInput);
      return;
    }

    this.addProduct(name, category, quantity);
    this.closeModal();
  }

  render() {
    const total = this.products.length;
    const bought = this.products.filter((product) => product.isBought).length;
    const left = total - bought;

    this.elements.emptyState.hidden = total > 0;
    this.elements.summaryStrip.hidden = total === 0;
    this.elements.shareButton.hidden = total === 0;

    this.elements.summaryTotal.textContent = `${total} ${total === 1 ? 'מוצר' : 'מוצרים'}`;
    this.elements.summaryBought.textContent = `${bought} נקנו`;
    this.elements.summaryLeft.textContent = `${left} חסרים`;

    this.elements.categoriesContainer.innerHTML = this.categories
      .map((category) => this.renderCategory(category))
      .filter(Boolean)
      .join('');
  }

  renderCategory(category) {
    const products = this.products.filter((product) => product.category === category.id);
    if (products.length === 0) {
      return '';
    }

    const boughtCount = products.filter((product) => product.isBought).length;
    const itemsHtml = products.map((product) => this.renderProduct(product)).join('');

    return `
      <article class="category-section">
        <header class="category-header">
          <div class="category-title">
            <span class="category-icon" aria-hidden="true">${category.icon}</span>
            <span>${this.escapeHtml(category.name)}</span>
          </div>
          <span class="category-count">${boughtCount}/${products.length}</span>
        </header>
        <ul class="product-list">
          ${itemsHtml}
        </ul>
      </article>
    `;
  }

  renderProduct(product) {
    const checked = product.isBought ? 'checked' : '';
    const boughtClass = product.isBought ? ' is-bought' : '';

    return `
      <li class="product-item${boughtClass}">
        <label class="product-label">
          <input
            class="product-checkbox"
            type="checkbox"
            data-action="toggle-product"
            data-id="${this.escapeHtml(product.id)}"
            ${checked}
          >
          <span class="product-text">
            <span class="product-name">${this.escapeHtml(product.name)}</span>
            <span class="product-quantity">כמות: ${this.escapeHtml(product.quantity)}</span>
          </span>
        </label>
        <button class="delete-button" type="button" data-action="delete-product" data-id="${this.escapeHtml(product.id)}" aria-label="מחק מוצר">×</button>
      </li>
    `;
  }

  generateWhatsAppText() {
    const missing = this.products.filter((product) => !product.isBought);
    const bought = this.products.filter((product) => product.isBought);
    const lines = ['*רשימת הקניות שלי*'];

    lines.push('', '*חסר לי:*');
    if (missing.length === 0) {
      lines.push('הכל נקנה.');
    } else {
      missing.forEach((product) => {
        lines.push(`- ${product.name} (${product.quantity})`);
      });
    }

    lines.push('', '*כבר קניתי:*');
    if (bought.length === 0) {
      lines.push('עדיין לא סומן שום מוצר.');
    } else {
      bought.forEach((product) => {
        lines.push(`- ~${product.name} (${product.quantity})~`);
      });
    }

    return lines.join('\n');
  }

  openWhatsAppShare() {
    const text = this.generateWhatsAppText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  openModal() {
    this.elements.form.reset();
    this.elements.quantityInput.value = '1';
    this.elements.modal.hidden = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => this.elements.nameInput.focus(), 50);
  }

  closeModal() {
    this.elements.modal.hidden = true;
    document.body.style.overflow = '';
  }

  markInvalid(element) {
    element.classList.remove('shake');
    void element.offsetWidth;
    element.classList.add('shake');
    element.focus();
  }

  createId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return `product_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.register('service-worker.js').catch((error) => {
      console.warn('Service Worker registration failed.', error);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.smartShop = new AppManager();
});
