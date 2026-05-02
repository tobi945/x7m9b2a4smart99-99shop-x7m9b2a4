'use strict';

/* ================================================================
   Smart Shop v3 — Chapter 3: Premium UX
   Features added: Swipe gestures · Undo toast · Vibration API
                   Wake Lock · Confetti · Web Audio · Dark Mode
   ================================================================ */

const CATEGORIES = [
  { id: 'fruits_vegetables', name: 'פירות וירקות',     icon: '🥦' },
  { id: 'dairy_eggs',        name: 'חלב וביצים',       icon: '🥛' },
  { id: 'bakery',            name: 'לחם ומאפים',       icon: '🍞' },
  { id: 'meat_fish',         name: 'בשר ודגים',        icon: '🥩' },
  { id: 'pantry',            name: 'מזווה ושימורים',   icon: '🥫' },
  { id: 'cleaning',          name: 'ניקיון וטואלטיקה', icon: '🧴' },
  { id: 'other',             name: 'שונות',             icon: '📦' },
];

// ── מחלקת מוצר ────────────────────────────────────────────────────

class Product {
  constructor(id, name, category, quantity = 1, isBought = false,
              price = 0, priority = 0, unit = '') {
    this.id       = id;
    this.name     = name;
    this.category = category;
    this.quantity = Number.isFinite(Number(quantity)) ? Math.max(1, Number(quantity)) : 1;
    this.isBought = Boolean(isBought);
    this.price    = Number.isFinite(Number(price))    ? Math.max(0, Number(price))    : 0;
    this.priority = Number(priority) === 1 ? 1 : 0;
    this.unit     = String(unit || '').slice(0, 10);
  }
  toggleStatus() { this.isBought = !this.isBought; }
}

// ── AppManager ────────────────────────────────────────────────────

class AppManager {
  constructor() {
    this.storageKey          = 'smart_shop_products_v1';
    this.historyKey          = 'smart_shop_history_v1';
    this.products            = [];
    this.history             = [];
    this.focusMode           = false;
    this._priority           = 0;
    this._undoTimer          = null;
    this._lastAllBought      = false;
    this.wakeLock            = null;
    this._swipeTouch         = null;   // { item, inner, startX, startY, lastX, tracking }
    this._pendingImport      = null;   // products decoded from incoming magic link
    this._scanStream         = null;   // MediaStream from camera
    this._scanActive         = false;  // QR scan loop running

    this.cacheDom();
    this.loadData();
    this.loadHistory();
    this.populateCategories();
    this.bindEvents();
    this.render();
    this.checkIncomingLink();
    this.registerServiceWorker();
  }

  // ── DOM ──────────────────────────────────────────────────────────

  cacheDom() {
    this.els = {
      focusModeBtn:   document.getElementById('focusModeBtn'),
      summaryStrip:   document.getElementById('summaryStrip'),
      summaryTotal:   document.getElementById('summaryTotal'),
      summaryBought:  document.getElementById('summaryBought'),
      summaryLeft:    document.getElementById('summaryLeft'),
      summaryBudget:  document.getElementById('summaryBudget'),
      emptyState:     document.getElementById('emptyState'),
      categoriesEl:   document.getElementById('categoriesContainer'),
      shareButton:    document.getElementById('shareWhatsAppButton'),
      modal:          document.getElementById('productModal'),
      form:           document.getElementById('productForm'),
      nameInput:      document.getElementById('productName'),
      nameHistory:    document.getElementById('nameHistory'),
      categorySelect: document.getElementById('productCategory'),
      quantityInput:  document.getElementById('productQuantity'),
      unitSelect:     document.getElementById('productUnit'),
      priceInput:     document.getElementById('productPrice'),
      priorityToggle: document.getElementById('priorityToggle'),
      undoToast:      document.getElementById('undoToast'),
      undoMessage:    document.getElementById('undoMessage'),
      undoBtn:        document.getElementById('undoBtn'),
      // Chapter 4
      shareModal:     document.getElementById('shareModal'),
      magicLinkInput: document.getElementById('magicLinkInput'),
      copyLinkBtn:    document.getElementById('copyLinkBtn'),
      toggleQrBtn:    document.getElementById('toggleQrBtn'),
      qrContainer:    document.getElementById('qrContainer'),
      importTextarea: document.getElementById('importTextarea'),
      importPreview:  document.getElementById('importPreview'),
      incomingBanner: document.getElementById('incomingBanner'),
      incomingCount:  document.getElementById('incomingCount'),
      qrScanWrapper:  document.getElementById('qrScanWrapper'),
      qrVideo:        document.getElementById('qrVideo'),
      qrCanvas:       document.getElementById('qrCanvas'),
    };
  }

  // ── שמירה / טעינה ─────────────────────────────────────────────────

  saveData() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.products));
  }

  loadData() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      const parsed = saved ? JSON.parse(saved) : [];
      this.products = parsed.map(item => new Product(
        item.id, item.name, item.category,
        item.quantity, item.isBought,
        item.price, item.priority, item.unit
      ));
    } catch { this.products = []; }
  }

  // ── היסטוריית השלמה ───────────────────────────────────────────────

  loadHistory() {
    try {
      const saved = localStorage.getItem(this.historyKey);
      this.history = saved ? JSON.parse(saved) : [];
    } catch { this.history = []; }
    this.updateSuggestions();
  }

  saveHistory() {
    localStorage.setItem(this.historyKey, JSON.stringify(this.history));
  }

  addToHistory(name) {
    const clean = name.trim();
    if (!clean) return;
    this.history = [clean, ...this.history.filter(h => h !== clean)].slice(0, 60);
    this.saveHistory();
    this.updateSuggestions();
  }

  updateSuggestions() {
    if (!this.els.nameHistory) return;
    this.els.nameHistory.innerHTML = this.history
      .map(n => `<option value="${this.escapeHtml(n)}">`)
      .join('');
  }

  // ── מוצרים ───────────────────────────────────────────────────────

  addProduct(name, category, quantity, price = 0, priority = 0, unit = '') {
    this.products.unshift(new Product(
      this.createId(), name.trim(), category,
      quantity, false, price, priority, unit
    ));
    this.addToHistory(name);
    this.saveData();
    this.render();
    this.playClick();
  }

  toggleProduct(id) {
    const product = this.products.find(p => p.id === id);
    if (!product) return;
    product.toggleStatus();
    this.saveData();
    this.render();
    this.vibrate(product.isBought ? [60, 30, 60] : [30]);
    this.checkCompletion();
  }

  deleteProduct(id) {
    this.products = this.products.filter(p => p.id !== id);
    this.saveData();
    this.render();
  }

  /** מחיקה עם אפשרות ביטול (3 שניות) */
  deleteProductWithUndo(id) {
    const product = this.products.find(p => p.id === id);
    if (!product) return;

    const snapshot  = { ...product };
    const origIndex = this.products.indexOf(product);

    this.products = this.products.filter(p => p.id !== id);
    this.saveData();
    this.render();
    this.vibrate([50, 50, 80]);

    this.showUndoToast(`נמחק: ${product.name}`, () => {
      // שחזור במיקום המקורי
      const restored = new Product(
        snapshot.id, snapshot.name, snapshot.category,
        snapshot.quantity, snapshot.isBought,
        snapshot.price, snapshot.priority, snapshot.unit
      );
      this.products.splice(Math.min(origIndex, this.products.length), 0, restored);
      this.saveData();
      this.render();
      this.vibrate([80]);
    });
  }

  handleProductSubmit() {
    const name     = this.els.nameInput.value.trim();
    const category = this.els.categorySelect.value;
    const quantity = Number(this.els.quantityInput.value);
    const price    = Number(this.els.priceInput.value) || 0;
    const unit     = this.els.unitSelect.value;
    const priority = this._priority;

    if (!name)                                       { this.markInvalid(this.els.nameInput);     return; }
    if (!category)                                   { this.markInvalid(this.els.categorySelect); return; }
    if (!Number.isFinite(quantity) || quantity < 1)  { this.markInvalid(this.els.quantityInput);  return; }

    this.addProduct(name, category, quantity, price, priority, unit);
    this.closeModal();
  }

  // ── רינדור ───────────────────────────────────────────────────────

  render() {
    const total  = this.products.length;
    const bought = this.products.filter(p => p.isBought).length;
    const left   = total - bought;
    const budget = this.products
      .filter(p => !p.isBought && p.price > 0)
      .reduce((s, p) => s + p.price * p.quantity, 0);

    this.els.emptyState.hidden   = total > 0;
    this.els.summaryStrip.hidden = total === 0;
    this.els.shareButton.hidden  = total === 0;

    this.els.summaryTotal.textContent  = `${total} ${total === 1 ? 'מוצר' : 'מוצרים'}`;
    this.els.summaryBought.textContent = `${bought} נקנו`;
    this.els.summaryLeft.textContent   = `${left} חסרים`;
    this.els.summaryBudget.textContent = budget > 0 ? `₪${budget.toFixed(0)} משוער` : '';

    this.els.categoriesEl.innerHTML = CATEGORIES
      .map(cat => this.renderCategory(cat))
      .filter(Boolean)
      .join('');

    this.setupSwipes();
  }

  renderCategory(category) {
    let products = this.products.filter(p => p.category === category.id);
    if (products.length === 0) return '';

    // מיון: ⭐ + לא-נקנה → רגיל + לא-נקנה → ⭐ + נקנה → רגיל + נקנה
    products = [
      ...products.filter(p => p.priority === 1 && !p.isBought),
      ...products.filter(p => p.priority === 0 && !p.isBought),
      ...products.filter(p => p.priority === 1 &&  p.isBought),
      ...products.filter(p => p.priority === 0 &&  p.isBought),
    ];

    const boughtCount = products.filter(p => p.isBought).length;
    return `
<article class="category-section">
  <header class="category-header">
    <div class="category-title">
      <span class="category-icon" aria-hidden="true">${category.icon}</span>
      <span>${this.escapeHtml(category.name)}</span>
    </div>
    <span class="category-count">${boughtCount}/${products.length}</span>
  </header>
  <ul class="product-list">${products.map(p => this.renderProduct(p)).join('')}</ul>
</article>`;
  }

  renderProduct(product) {
    const boughtClass    = product.isBought ? ' is-bought' : '';
    const priorityClass  = product.priority === 1 ? ' is-priority' : '';
    const checked        = product.isBought ? 'checked' : '';
    const starHtml       = product.priority === 1
      ? '<span class="priority-star" aria-hidden="true">⭐</span>' : '';
    const quantityText   = product.unit
      ? `${product.quantity} ${this.escapeHtml(product.unit)}`
      : `כמות: ${product.quantity}`;
    const priceHtml      = product.price > 0
      ? `<span class="price-tag">₪${(product.price * product.quantity).toFixed(0)}</span>` : '';
    const id = this.escapeHtml(product.id);

    return `
<li class="product-item${boughtClass}${priorityClass}" data-id="${id}">
  <div class="product-inner">
    <label class="product-label">
      <input class="product-checkbox" type="checkbox"
             data-action="toggle-product" data-id="${id}" ${checked}>
      <span class="product-text">
        <span class="product-name">${starHtml}${this.escapeHtml(product.name)}</span>
        <span class="product-quantity">${quantityText}${priceHtml}</span>
      </span>
    </label>
    <button class="delete-button" type="button"
            data-action="delete-product" data-id="${id}"
            aria-label="מחק מוצר">×</button>
  </div>
</li>`;
  }

  // ── Swipe-to-Action ───────────────────────────────────────────────

  setupSwipes() {
    const container = this.els.categoriesEl;
    const THRESHOLD = 72;   // px to trigger action
    const MAX_SHIFT = 110;  // px cap during drag

    const reset = (touch) => {
      if (!touch) return;
      touch.inner.style.transition = 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)';
      touch.inner.style.transform  = '';
      touch.item.classList.remove('swipe-right-active', 'swipe-left-active');
    };

    container.addEventListener('touchstart', e => {
      const item = e.target.closest('.product-item');
      if (!item) return;
      const inner = item.querySelector('.product-inner');
      const t = e.touches[0];
      this._swipeTouch = {
        item, inner,
        startX: t.clientX, startY: t.clientY,
        lastX:  t.clientX,
        tracking: false,
      };
      inner.style.transition = 'none';
    }, { passive: true });

    container.addEventListener('touchmove', e => {
      const touch = this._swipeTouch;
      if (!touch) return;
      const t  = e.touches[0];
      const dx = t.clientX - touch.startX;
      const dy = t.clientY - touch.startY;

      // זיהוי גלילה אנכית — לא להפריע לה
      if (!touch.tracking) {
        if (Math.abs(dy) > Math.abs(dx) + 6) { this._swipeTouch = null; return; }
        if (Math.abs(dx) > 8) touch.tracking = true;
      }
      if (!touch.tracking) return;

      e.preventDefault();
      touch.lastX = t.clientX;

      const capped = Math.max(-MAX_SHIFT, Math.min(MAX_SHIFT, dx));
      touch.inner.style.transform = `translateX(${capped}px)`;
      touch.item.classList.toggle('swipe-right-active', dx >  30);
      touch.item.classList.toggle('swipe-left-active',  dx < -30);
    }, { passive: false });

    const onEnd = () => {
      const touch = this._swipeTouch;
      if (!touch) return;
      this._swipeTouch = null;

      if (!touch.tracking) { reset(touch); return; }

      const dx = touch.lastX - touch.startX;
      reset(touch);

      const id = touch.item.dataset.id;
      if      (dx >  THRESHOLD) this.toggleProduct(id);
      else if (dx < -THRESHOLD) this.deleteProductWithUndo(id);
    };

    container.addEventListener('touchend',    onEnd);
    container.addEventListener('touchcancel', () => {
      reset(this._swipeTouch);
      this._swipeTouch = null;
    });
  }

  // ── Undo Toast ────────────────────────────────────────────────────

  showUndoToast(message, undoFn) {
    clearTimeout(this._undoTimer);

    // החלפת כפתור ה"בטל" כדי להסיר listener ישן
    const oldBtn = this.els.undoBtn;
    const newBtn = oldBtn.cloneNode(true);
    newBtn.hidden = false;
    oldBtn.replaceWith(newBtn);
    this.els.undoBtn = newBtn;

    this.els.undoMessage.textContent = message;
    this.els.undoToast.hidden = false;
    requestAnimationFrame(() => this.els.undoToast.classList.add('visible'));

    newBtn.addEventListener('click', () => {
      clearTimeout(this._undoTimer);
      undoFn();
      this.hideUndoToast();
    }, { once: true });

    this._undoTimer = setTimeout(() => this.hideUndoToast(), 3500);
  }

  hideUndoToast() {
    this.els.undoToast.classList.remove('visible');
    setTimeout(() => {
      this.els.undoToast.hidden = true;
      this.els.undoBtn.hidden   = false;
    }, 320);
  }

  /** Toast ללא כפתור ביטול (אינפורמציה בלבד) */
  showToast(message) {
    this.els.undoMessage.textContent = message;
    this.els.undoBtn.hidden          = true;
    this.els.undoToast.hidden        = false;
    requestAnimationFrame(() => this.els.undoToast.classList.add('visible'));
    clearTimeout(this._undoTimer);
    this._undoTimer = setTimeout(() => this.hideUndoToast(), 2400);
  }

  // ── Vibration API ─────────────────────────────────────────────────

  vibrate(pattern) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
  }

  // ── Wake Lock API ─────────────────────────────────────────────────

  async requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
    } catch { /* ignore — user may have denied or device doesn't support */ }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  // ── Focus Mode ────────────────────────────────────────────────────

  toggleFocusMode() {
    this.focusMode = !this.focusMode;
    document.body.classList.toggle('focus-mode', this.focusMode);
    this.els.focusModeBtn.classList.toggle('focus-active', this.focusMode);
    this.els.focusModeBtn.title = this.focusMode ? 'יציאה ממצב סופר' : 'מצב סופר';
    this.els.focusModeBtn.setAttribute('aria-pressed', String(this.focusMode));

    if (this.focusMode) {
      this.requestWakeLock();
      this.vibrate([100, 50, 100]);
    } else {
      this.releaseWakeLock();
      this.vibrate([50]);
    }
  }

  // ── Completion Check + Confetti + Sound ───────────────────────────

  checkCompletion() {
    if (this.products.length === 0) return;
    const allBought = this.products.every(p => p.isBought);
    if (allBought && !this._lastAllBought) {
      this.launchConfetti();
      this.playSuccess();
      this.vibrate([100, 50, 100, 50, 200]);
    }
    this._lastAllBought = allBought;
  }

  launchConfetti() {
    const colors = ['#f5a623', '#1f7a4d', '#25d366', '#ff6b6b', '#4ecdc4', '#a78bfa'];
    const wrap = document.createElement('div');
    wrap.className = 'confetti-container';
    document.body.appendChild(wrap);

    for (let i = 0; i < 90; i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.cssText = [
        `--color:${colors[i % colors.length]}`,
        `--x:${5 + Math.random() * 90}vw`,
        `--delay:${(Math.random() * 0.5).toFixed(2)}s`,
        `--dur:${(0.8 + Math.random() * 0.8).toFixed(2)}s`,
        `--spin:${Math.floor(Math.random() * 720)}deg`,
        `--size:${6 + Math.floor(Math.random() * 8)}px`,
      ].join(';');
      wrap.appendChild(piece);
    }

    setTimeout(() => wrap.remove(), 2600);
  }

  // ── Web Audio ─────────────────────────────────────────────────────

  playSuccess() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [523, 659, 784, 1047].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch { /* ignore */ }
  }

  playClick() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1100;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.055);
    } catch { /* ignore */ }
  }

  // ── WhatsApp ──────────────────────────────────────────────────────

  generateWhatsAppText() {
    const missing = this.products.filter(p => !p.isBought);
    const bought  = this.products.filter(p => p.isBought);
    const budget  = missing.filter(p => p.price > 0)
                           .reduce((s, p) => s + p.price * p.quantity, 0);

    const lines = ['🛒 *רשימת הקניות שלי*'];

    lines.push('', '*חסר לי:*');
    if (missing.length === 0) {
      lines.push('הכל נקנה! 🎉');
    } else {
      const prio   = missing.filter(p => p.priority === 1);
      const normal = missing.filter(p => p.priority === 0);
      if (prio.length)   { lines.push('⭐ _דחוף:_');  prio.forEach(p   => lines.push(`- ${p.name} (${p.quantity}${p.unit ? ' ' + p.unit : ''})`)); }
      if (normal.length) { if (prio.length) lines.push(''); normal.forEach(p => lines.push(`- ${p.name} (${p.quantity}${p.unit ? ' ' + p.unit : ''})`)); }
    }

    if (budget > 0) lines.push('', `💰 *סה"כ משוער: ₪${budget.toFixed(0)}*`);

    lines.push('', '*כבר קניתי:*');
    if (bought.length === 0) lines.push('עדיין לא סומן שום מוצר.');
    else bought.forEach(p => lines.push(`- ~${p.name} (${p.quantity})~`));

    return lines.join('\n');
  }

  openWhatsAppShare() {
    const text = this.generateWhatsAppText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  }

  // ── Events ────────────────────────────────────────────────────────

  bindEvents() {
    this.els.focusModeBtn.addEventListener('click', () => this.toggleFocusMode());

    document.getElementById('openProductModal').addEventListener('click', () => this.openModal());
    document.getElementById('emptyAddButton').addEventListener('click',  () => this.openModal());
    document.getElementById('closeProductModal').addEventListener('click',  () => this.closeModal());
    document.getElementById('cancelProductButton').addEventListener('click', () => this.closeModal());
    this.els.modal.addEventListener('click', e => { if (e.target === this.els.modal) this.closeModal(); });
    this.els.form.addEventListener('submit', e => { e.preventDefault(); this.handleProductSubmit(); });

    this.els.priorityToggle.addEventListener('click', () => {
      this._priority = this._priority === 0 ? 1 : 0;
      this.els.priorityToggle.dataset.priority = String(this._priority);
      this.els.priorityToggle.textContent = this._priority === 1 ? '⭐ חשוב' : '☆ רגיל';
    });

    // Event delegation — checkbox & delete button
    this.els.categoriesEl.addEventListener('change', e => {
      const cb = e.target.closest('[data-action="toggle-product"]');
      if (cb) this.toggleProduct(cb.dataset.id);
    });
    this.els.categoriesEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="delete-product"]');
      if (btn) this.deleteProductWithUndo(btn.dataset.id);
    });

    this.els.shareButton.addEventListener('click', () => this.openWhatsAppShare());

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!this.els.modal.hidden)       this.closeModal();
      else if (!this.els.shareModal.hidden) this.closeShareModal();
    });

    // Re-request Wake Lock if page becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.focusMode && !this.wakeLock) {
        this.requestWakeLock();
      }
    });

    // ── Chapter 4: Share modal ────────────────────────────────────
    document.getElementById('openShareModal').addEventListener('click',  () => this.openShareModal());
    document.getElementById('closeShareModal').addEventListener('click', () => this.closeShareModal());
    this.els.shareModal.addEventListener('click', e => {
      if (e.target === this.els.shareModal) this.closeShareModal();
    });
    this.els.shareModal.querySelectorAll('.share-tab').forEach(tab =>
      tab.addEventListener('click', () => this.switchShareTab(tab))
    );
    this.els.copyLinkBtn.addEventListener('click',                             () => this.handleCopyLink());
    document.getElementById('toggleQrBtn').addEventListener('click',          () => this.handleToggleQR());
    document.getElementById('shareViaWhatsApp').addEventListener('click',     () => this.handleShareViaWhatsApp());
    this.els.importTextarea.addEventListener('input',                         () => this.updateImportPreview());
    document.getElementById('importFromTextBtn').addEventListener('click',    () => this.handleImportFromText());
    document.getElementById('incomingAcceptBtn').addEventListener('click',    () => this.acceptIncomingLink());
    document.getElementById('incomingDenyBtn').addEventListener('click',      () => this.dismissIncomingBanner());
    document.getElementById('scanQrBtn').addEventListener('click',            () => this.startQrScan());
    document.getElementById('stopScanBtn').addEventListener('click',          () => this.stopQrScan());
  }

  // ── Modal ─────────────────────────────────────────────────────────

  populateCategories() {
    this.els.categorySelect.innerHTML = CATEGORIES
      .map(c => `<option value="${this.escapeHtml(c.id)}">${this.escapeHtml(c.name)}</option>`)
      .join('');
  }

  openModal() {
    this._priority = 0;
    this.els.form.reset();
    this.els.quantityInput.value             = '1';
    this.els.priorityToggle.textContent      = '☆ רגיל';
    this.els.priorityToggle.dataset.priority = '0';
    this.els.modal.hidden        = false;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => this.els.nameInput.focus(), 50);
  }

  closeModal() {
    this.els.modal.hidden        = true;
    document.body.style.overflow = '';
  }

  // ── Helpers ───────────────────────────────────────────────────────

  markInvalid(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    el.focus();
  }

  createId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  escapeHtml(v) {
    return String(v)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  // ── Chapter 4: Magic Link ─────────────────────────────────────

  encodeMagicLink() {
    // Compact: [name, category, quantity, unit, price, priority]
    const compact = this.products.map(p =>
      [p.name, p.category, p.quantity, p.unit, p.price, p.priority]
    );
    const json = JSON.stringify(compact);
    const b64  = btoa(unescape(encodeURIComponent(json)));
    return `${location.origin}${location.pathname}?data=${encodeURIComponent(b64)}`;
  }

  decodeMagicLink(raw) {
    const json = decodeURIComponent(escape(atob(decodeURIComponent(raw))));
    const arr  = JSON.parse(json);
    if (!Array.isArray(arr)) throw new Error('invalid');
    return arr.map(([name, category, quantity, unit, price, priority]) =>
      new Product(
        this.createId(), String(name || ''), String(category || 'other'),
        Number(quantity) || 1, false,
        Number(price) || 0, Number(priority) || 0, String(unit || '')
      )
    );
  }

  checkIncomingLink() {
    const params  = new URLSearchParams(location.search);
    const encoded = params.get('data');
    if (!encoded) return;
    // Remove query string from URL bar immediately
    history.replaceState({}, '', location.pathname + location.hash);
    try {
      const products = this.decodeMagicLink(encoded);
      if (products.length === 0) return;
      this._pendingImport = products;
      this.els.incomingCount.textContent = ` — ${products.length} מוצרים`;
      this.els.incomingBanner.hidden = false;
    } catch { /* ignore malformed */ }
  }

  acceptIncomingLink() {
    if (!this._pendingImport) return;
    const count = this._pendingImport.length;
    this._pendingImport.forEach(p => {
      this.products.push(p);
      this.addToHistory(p.name);
    });
    this._pendingImport = null;
    this.els.incomingBanner.hidden = true;
    this.saveData();
    this.render();
    this.vibrate([80, 40, 80]);
    this.showToast(`✅ יובאו ${count} מוצרים`);
  }

  dismissIncomingBanner() {
    this._pendingImport = null;
    this.els.incomingBanner.hidden = true;
  }

  // ── Chapter 4: Share Modal ────────────────────────────────────

  openShareModal() {
    this.els.magicLinkInput.value    = this.encodeMagicLink();
    this.els.qrContainer.hidden      = true;
    this.els.qrContainer.innerHTML   = '';
    this.els.toggleQrBtn.textContent = '📷 הצג QR';
    this.els.importTextarea.value    = '';
    this.els.importPreview.hidden    = true;
    // Reset to Export tab
    this.switchShareTab(
      this.els.shareModal.querySelector('[data-panel="panelExport"]')
    );
    this.els.shareModal.hidden   = false;
    document.body.style.overflow = 'hidden';
  }

  closeShareModal() {
    this.stopQrScan();
    this.els.shareModal.hidden   = true;
    document.body.style.overflow = '';
  }

  switchShareTab(activeTab) {
    if (activeTab.dataset.panel !== 'panelImport') this.stopQrScan();
    this.els.shareModal.querySelectorAll('.share-tab').forEach(t =>
      t.classList.remove('active')
    );
    this.els.shareModal.querySelectorAll('.share-panel').forEach(p => {
      p.hidden = true;
    });
    activeTab.classList.add('active');
    document.getElementById(activeTab.dataset.panel).hidden = false;
  }

  async handleCopyLink() {
    const url = this.els.magicLinkInput.value;
    try {
      await navigator.clipboard.writeText(url);
      this.els.copyLinkBtn.textContent = '✅ הועתק!';
      setTimeout(() => { this.els.copyLinkBtn.textContent = '📋 העתק'; }, 2200);
    } catch {
      this.els.magicLinkInput.select();
    }
  }

  handleShareViaWhatsApp() {
    const url = this.els.magicLinkInput.value;
    const msg = `🛒 רשימת הקניות שלי (לחץ לפתיחה): ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  handleToggleQR() {
    if (!this.els.qrContainer.hidden) {
      this.els.qrContainer.hidden      = true;
      this.els.qrContainer.innerHTML   = '';
      this.els.toggleQrBtn.textContent = '📷 הצג QR';
      return;
    }
    this.generateQR(this.els.magicLinkInput.value);
  }

  generateQR(url) {
    try {
      /* global qrcode */
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const svgStr = qr.createSvgTag(4, 2);
      this.els.qrContainer.innerHTML = svgStr;
      // Make SVG responsive
      const svgEl = this.els.qrContainer.querySelector('svg');
      if (svgEl) {
        const w = svgEl.getAttribute('width');
        const h = svgEl.getAttribute('height');
        if (w && h) svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svgEl.removeAttribute('width');
        svgEl.removeAttribute('height');
      }
      this.els.qrContainer.hidden      = false;
      this.els.toggleQrBtn.textContent = '🙈 הסתר QR';
    } catch {
      this.els.qrContainer.innerHTML   = '<p class="qr-error">הרשימה ארוכה מדי לקוד QR — השתמש בקישור</p>';
      this.els.qrContainer.hidden      = false;
    }
  }

  // ── Chapter 4: WhatsApp Text Import ──────────────────────────

  guessCategory(name) {
    const n = name;
    if (/חלב|גבינ|יוגורט|ביצ|קוטג|שמנת|מוצרלה|פרמזן|בולגרי|לאבנה/.test(n))         return 'dairy_eggs';
    if (/לחם|חלה|פיתה|בגט|עוגה|עוגי|קרואסון|מאפה/.test(n))                           return 'bakery';
    if (/עגבני|מלפפ|פלפל|בצל|שום|תפוח|בננ|לימון|אבוקדו|גזר|סלק|תות|ענב|מנגו|אננס|קיווי|ברוקולי|כרוב|חסה|תרד|זוקיני|חציל|דלעת|בטטה/.test(n)) return 'fruits_vegetables';
    if (/בשר|עוף|דג|קציצ|שניצל|טחון|סלמון|טונה|אמנון|נקניק|כבד|פרגית/.test(n))      return 'meat_fish';
    if (/שמן|סוכר|קמח|אורז|פסטה|שוקולד|ריבה|מים|קפה|תה|דבש|חומוס|טחינה|קטשופ|מיונז|מלח|שימורים|שעועית|עדשים/.test(n)) return 'pantry';
    if (/סבון|שמפו|מרכך|נייר|ניקוי|אבקה|ספוג|שקיות/.test(n))                         return 'cleaning';
    return 'other';
  }

  parseWhatsAppText(text) {
    if (!text?.trim()) return [];
    return text
      .split(/[\n,]+/)
      .map(line => line.replace(/^[\s\-\*•✓✗\d.\)]+/, '').trim())
      .filter(line => line.length >= 2)
      .map(line => {
        const afterNum  = line.match(/^(.+?)\s+×?(\d+)\s*$/);  // "חלב 2"
        const beforeNum = line.match(/^×?(\d+)\s+(.+)$/);      // "2 חלב"
        let name, qty;
        if (afterNum)  { name = afterNum[1].trim();  qty = parseInt(afterNum[2],  10); }
        else if (beforeNum) { qty = parseInt(beforeNum[1], 10); name = beforeNum[2].trim(); }
        else           { name = line; qty = 1; }
        name = name.replace(/\s*\(.*\)\s*$/, '').trim(); // strip trailing parens
        if (name.length < 2) return null;
        return { name, quantity: Math.max(1, qty || 1), category: this.guessCategory(name) };
      })
      .filter(Boolean);
  }

  updateImportPreview() {
    const parsed  = this.parseWhatsAppText(this.els.importTextarea.value);
    const preview = this.els.importPreview;
    if (parsed.length === 0) { preview.hidden = true; return; }

    const ICON = Object.fromEntries(CATEGORIES.map(c => [c.id, c.icon]));
    preview.innerHTML = `
      <p class="preview-label">${parsed.length} מוצרים לייבוא:</p>
      <div class="preview-chips">
        ${parsed.map(p => `
          <span class="preview-chip">
            ${ICON[p.category] || '📦'} ${this.escapeHtml(p.name)}${p.quantity > 1 ? ` ×${p.quantity}` : ''}
          </span>`).join('')}
      </div>`;
    preview.hidden = false;
  }

  handleImportFromText() {
    const parsed = this.parseWhatsAppText(this.els.importTextarea.value);
    if (parsed.length === 0) { this.markInvalid(this.els.importTextarea); return; }

    parsed.forEach(({ name, quantity, category }) => {
      this.products.unshift(new Product(this.createId(), name, category, quantity));
      this.addToHistory(name);
    });
    this.saveData();
    this.render();
    this.vibrate([80, 40, 80]);
    this.closeShareModal();
    this.showToast(`✅ יובאו ${parsed.length} מוצרים`);
  }

  // ── Chapter 4: QR Camera Scanner ─────────────────────────────

  async startQrScan() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.showToast('❌ המצלמה אינה נתמכת בדפדפן זה');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } }
      });
      this.els.qrVideo.srcObject = stream;
      await this.els.qrVideo.play();
      this._scanStream = stream;
      this._scanActive = true;
      this.els.qrScanWrapper.hidden = false;
      this._tickScan();
    } catch {
      this.showToast('❌ לא ניתן לגשת למצלמה');
    }
  }

  _tickScan() {
    if (!this._scanActive) return;
    const video = this.els.qrVideo;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = this.els.qrCanvas;
      const ctx    = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      /* global jsQR */
      const code = typeof jsQR === 'function'
        ? jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' })
        : null;
      if (code) {
        this.stopQrScan();
        this.handleScannedQR(code.data);
        return;
      }
    }
    setTimeout(() => this._tickScan(), 150);
  }

  stopQrScan() {
    this._scanActive = false;
    if (this._scanStream) {
      this._scanStream.getTracks().forEach(t => t.stop());
      this._scanStream = null;
    }
    if (this.els.qrScanWrapper) this.els.qrScanWrapper.hidden = true;
  }

  handleScannedQR(data) {
    try {
      const url     = new URL(data);
      const encoded = url.searchParams.get('data');
      if (!encoded) throw new Error('no data param');
      const products = this.decodeMagicLink(encoded);
      if (products.length === 0) throw new Error('empty list');
      this._pendingImport = products;
      this.els.incomingCount.textContent = ` — ${products.length} מוצרים`;
      this.els.incomingBanner.hidden = false;
      this.closeShareModal();
      this.vibrate([100, 50, 100]);
    } catch {
      this.showToast('❌ קוד QR לא תקין');
    }
  }

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.warn('SW error', err));
  }
}

document.addEventListener('DOMContentLoaded', () => { window.smartShop = new AppManager(); });
