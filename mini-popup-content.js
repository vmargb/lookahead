class LookaheadMiniPopup {
  constructor() {
    this.popup = null;
    this.results = [];
    this.selectedIndex = 0;
    this.isVisible = false;
    this.keyHandler = null; // Store reference to handler
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

    // Add click-outside-to-close functionality
    this.popup.addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(this.popup);
    this.setupKeyboardListeners();
    
    // Auto-focus the popup for better keyboard interaction
    this.popup.focus();
  }

  setupKeyboardListeners() {
    // Remove any existing listener first
    this.removeKeyboardListeners();

    // key handling logic listener here!
    this.keyHandler = (e) => {
      if (!this.isVisible || !this.popup) return;

      // Only handle events when popup is active and no input is focused
      const activeElement = document.activeElement;
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.isContentEditable
      );
      
      if (isInputFocused) return;

      // prevent default behaviour for number keys
      const num = this.getNumberFromKeyEvent(e);
      if (num !== null && num >= 1 && num <= this.results.length) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.selectResult(num - 1);
        return;
      }

      // Prevent default behavior for other keys
      const handledKeys = ['Escape', 'ArrowUp', 'ArrowDown', 'Enter'];
      if (handledKeys.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();

        switch(e.key) {
          case 'Escape':
            this.hide();
            break;
          case 'ArrowUp':
            this.navigateUp();
            break;
          case 'ArrowDown':
            this.navigateDown();
            break;
          case 'Enter':
            this.selectResult(this.selectedIndex);
            break;
        }
      }
    };

    // Use capture phase to handle before other listeners
    document.addEventListener('keydown', this.keyHandler, true);
    
    // close popup if i click somewhere outside the popup
    this.documentClickHandler = (e) => {
      if (this.isVisible && this.popup && !this.popup.contains(e.target)) {
        this.hide();
      }
    };
    document.addEventListener('click', this.documentClickHandler);
  }

  // enhanced number detection that handles various keyboard layouts and scenarios
  // only necessary because num keys dont work on different machines
  getNumberFromKeyEvent(e) {
    // method 1: Check e.key (most reliable for modern browsers)
    if (e.key && /^[1-9]$/.test(e.key)) { return parseInt(e.key); }
    // method 2: Check e.code for physical key position (handles different layouts)
    if (e.code) {
      const codeToNumber = {
        'Digit1': 1, 'Digit2': 2, 'Digit3': 3, 'Digit4': 4, 'Digit5': 5,
        'Digit6': 6, 'Digit7': 7, 'Digit8': 8, 'Digit9': 9
      };
      if (codeToNumber[e.code]) { return codeToNumber[e.code]; }
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
    
    // Scroll selected item into view
    const selectedItem = this.popup.querySelector('.popup-result-item.selected');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
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

// Global instance - but check if it already exists
if (!window.lookaheadMiniPopup) {
  window.lookaheadMiniPopup = new LookaheadMiniPopup();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showMiniPopup') {
    window.lookaheadMiniPopup.show(request.results, request.currentIndex);
  } else if (request.action === 'hideMiniPopup') {
    window.lookaheadMiniPopup.hide();
  }
});
