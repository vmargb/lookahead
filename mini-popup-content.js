class LookaheadMiniPopup {
  constructor() {
    this.popup = null;
    this.results = [];
    this.selectedIndex = 0;
    this.isVisible = false;
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
    this.isVisible = false;
  }

  createPopup() {
    this.popup = document.createElement('div');
    this.popup.className = 'lookahead-mini-popup';
    
    this.popup.innerHTML = `
      <div class="popup-header">
        Quick Results
        <button class="popup-close">×</button>
      </div>
      <div class="popup-results">
        ${this.results.map((result, index) => `
          <div class="popup-result-item ${index === this.selectedIndex ? 'selected' : ''}" data-index="${index}">
            <div class="result-number">${index + 1}</div>
            <div class="result-info">
              <div class="result-mini-title">${this.escapeHtml(result.title)}</div>
              <div class="result-mini-url">${result.url}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="popup-hint">
        Press 1-9 to select • Esc to close • ↑↓ to navigate
      </div>
    `;

    // Add event listeners
    this.popup.querySelector('.popup-close').addEventListener('click', () => this.hide());
    
    this.popup.querySelectorAll('.popup-result-item').forEach((item, index) => {
      item.addEventListener('click', () => this.selectResult(index));
    });

    document.body.appendChild(this.popup);
    this.setupKeyboardListeners();
  }

  setupKeyboardListeners() {
    this.keyHandler = (e) => {
      if (!this.isVisible) return;

      switch(e.key) {
        case 'Escape':
          e.preventDefault();
          this.hide();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.navigateUp();
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.navigateDown();
          break;
        case 'Enter':
          e.preventDefault();
          this.selectResult(this.selectedIndex);
          break;
        default:
          const num = parseInt(e.key);
          if (num >= 1 && num <= this.results.length) {
            e.preventDefault();
            this.selectResult(num - 1);
          }
          break;
      }
    };

    document.addEventListener('keydown', this.keyHandler);
  }

  navigateUp() {
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    this.updateSelection();
  }

  navigateDown() {
    this.selectedIndex = Math.min(this.results.length - 1, this.selectedIndex + 1);
    this.updateSelection();
  }

  updateSelection() {
    this.popup.querySelectorAll('.popup-result-item').forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
    });
  }

  selectResult(index) {
    if (this.results[index]) {
      // Navigate to the selected result
      window.location.href = this.results[index].url;
      this.hide();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

window.lookaheadMiniPopup = new LookaheadMiniPopup();

// listen for messages from background script (similar to content.js)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showMiniPopup') {
    window.lookaheadMiniPopup.show(request.results, request.currentIndex);
  } else if (request.action === 'hideMiniPopup') {
    window.lookaheadMiniPopup.hide();
  }
});