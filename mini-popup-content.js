class LookaheadMiniPopup {
  constructor() {
    this.popup = null;
    this.results = [];
    this.selectedIndex = 0;
    this.isVisible = false;
    this.keyHandler = null;
    this.documentClickHandler = null;
  }

  show(results, currentIndex = 0) {
    if (this.isVisible) {
      this.hide();
      return;
    }
    this.results = results;
    this.selectedIndex = currentIndex;
    this.createPopup();
    this.isVisible = true;
  }

  hide() {
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
    this.removeKeyboardListeners(); // Clean up listeners
    this.isVisible = false;
  }

  // ======================================
  // createPopup
  // Builds the popup entirely with DOM
  // methods — no innerHTML — to avoid
  // unsafe assignment warnings and XSS.
  // ======================================
  createPopup() {
    this.popup = document.createElement('div');
    this.popup.className = 'lookahead-mini-popup';
    this.popup.setAttribute('tabindex', '-1');

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'popup-header';
    header.textContent = 'Quick Results'; // safe

    const closeBtn = document.createElement('button');
    closeBtn.className = 'popup-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    // --- Results list ---
    const resultsList = document.createElement('div');
    resultsList.className = 'popup-results';

    this.results.forEach((result, index) => {
      const item = document.createElement('div');
      item.className = 'popup-result-item' + (index === this.selectedIndex ? ' selected' : '');
      item.dataset.index = String(index);

      const numBadge = document.createElement('div');
      numBadge.className = 'result-number';
      numBadge.textContent = String(index + 1);

      const info = document.createElement('div');
      info.className = 'result-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'result-mini-title';
      titleEl.textContent = result.title; // textContent — XSS-safe

      const urlEl = document.createElement('div');
      urlEl.className = 'result-mini-url';
      urlEl.textContent = result.url; // textContent — XSS-safe

      info.append(titleEl, urlEl);
      item.append(numBadge, info);

      item.addEventListener('click', () => this.selectResult(index));
      resultsList.appendChild(item);
    });

    // --- Hint bar ---
    const hint = document.createElement('div');
    hint.className = 'popup-hint';
    hint.textContent = 'Press 1-9 to select • Esc to close • ↑↓ to navigate';

    // --- Assemble ---
    this.popup.append(header, resultsList, hint);

    // Stop clicks inside popup from bubbling to the document handler
    this.popup.addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(this.popup);
    this.setupKeyboardListeners();
    this.popup.focus();
  }

  setupKeyboardListeners() {
    this.removeKeyboardListeners();

    this.keyHandler = (e) => {
      if (!this.isVisible || !this.popup) return;

      // Don't intercept when an input is focused
      const active = document.activeElement;
      const isInput = active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable
      );
      if (isInput) return;

      // Number keys: jump to result
      const num = this.getNumberFromKeyEvent(e);
      if (num !== null && num >= 1 && num <= this.results.length) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.selectResult(num - 1);
        return;
      }

      // Arrow / Enter / Escape
      const handled = ['Escape', 'ArrowUp', 'ArrowDown', 'Enter'];
      if (handled.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        switch (e.key) {
          case 'Escape':    this.hide();                       break;
          case 'ArrowUp':   this.navigateUp();                 break;
          case 'ArrowDown': this.navigateDown();               break;
          case 'Enter':     this.selectResult(this.selectedIndex); break;
        }
      }
    };

    document.addEventListener('keydown', this.keyHandler, true);

    this.documentClickHandler = (e) => {
      if (this.isVisible && this.popup && !this.popup.contains(e.target)) {
        this.hide();
      }
    };
    document.addEventListener('click', this.documentClickHandler);
  }

  // Enhanced number key detection for cross-layout support
  getNumberFromKeyEvent(e) {
    if (e.key && /^[1-9]$/.test(e.key)) return parseInt(e.key);
    if (e.code) {
      const map = {
        Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5,
        Digit6: 6, Digit7: 7, Digit8: 8, Digit9: 9
      };
      if (map[e.code]) return map[e.code];
    }
    return null;
  }

  removeKeyboardListeners() {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
      this.documentClickHandler = null;
    }
  }

  navigateUp() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.updateSelection();
    }
  }

  navigateDown() {
    if (this.selectedIndex < this.results.length - 1) {
      this.selectedIndex++;
      this.updateSelection();
    }
  }

  updateSelection() {
    if (!this.popup) return;
    this.popup.querySelectorAll('.popup-result-item').forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });
    const selected = this.popup.querySelector('.popup-result-item.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  selectResult(index) {
    if (this.results[index]) {
      window.location.href = this.results[index].url;
      this.hide();
    }
  }
}

// Singleton — guard against double-injection
if (!window.lookaheadMiniPopup) {
  window.lookaheadMiniPopup = new LookaheadMiniPopup();
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showMiniPopup') {
    window.lookaheadMiniPopup.show(request.results, request.currentIndex);
  } else if (request.action === 'hideMiniPopup') {
    window.lookaheadMiniPopup.hide();
  }
});
