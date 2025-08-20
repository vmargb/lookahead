// ===========================
// CONTENT.JS
// ===========================
// This script's only job is to show a loading screen,
// wait for a message from background.js, scrape the page
// for results, and send that raw data back.
// ======================================

const urlParams = new URLSearchParams(window.location.search);
const isExtensionSearch = urlParams.has('la');

if (isExtensionSearch) {
  // ===========================================
  // *** LOADING SCREEN ***
  // ===========================================
  function showLoadingScreen() {
    const overlay = document.createElement('div');
    overlay.id = 'look-ahead-overlay';
    const text = document.createElement('h1');
    text.textContent = 'Looking Ahead...';

    const styles = document.createElement('style');
    styles.textContent = `
      #look-ahead-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: #1a1a1a; color: #e0e0e0;
        display: flex; justify-content: center; align-items: center;
        z-index: 9999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        opacity: 1;
      }
      #look-ahead-overlay h1 {
        font-size: 2.5rem; font-weight: 300; margin: 0;
      }
    `;

    document.head.appendChild(styles);
    overlay.appendChild(text);
    document.body.appendChild(overlay);
  }

  showLoadingScreen();

  // ===========================
  // *** MESSAGE LISTENER ***
  // ===========================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "findBestResult") {
      // engine is needed to know which page selectors to use.
      const engine = request.engine || 'duckduckgo';

      const SELECTORS = {
        duckduckgo: 'a[data-testid="result-title-a"]',
        google: 'h3 a, a h3',
        bing: 'h2 a'
      };

      const selector = SELECTORS[engine];
      if (!selector) {
        sendResponse({ results: [] });
        return;
      }
      
      const results = Array.from(document.querySelectorAll(selector)).slice(0, 10);

      // ======================================
      // *** SEARCH RESULT EXTRACTION LOGIC ***
      // ======================================
      // handle different structures for
      // different search engines
      // google: h3 a, a h3
      // bing: h2 a
      // duckduckgo: a
      // ========================================
      const extractedResults = results
        .map(a => {
          let url, title;
          if (engine === 'google') {
            url = a.href || a.parentElement?.href;
            title = a.innerText || a.textContent || '';
          } else {
            url = a.href;
            title = a.innerText || a.textContent || '';
          }
          return { url, title };
        })
        .filter(({ url, title }) => {
          if (!url || !title) return false;
          const hostname = new URL(url).hostname;
          return !hostname.includes('google.com') && 
                 !hostname.includes('duckduckgo.com') && 
                 !hostname.includes('bing.com');
        });
      // ======================================
      // ** send the raw, unscored results back **
      sendResponse({ results: extractedResults });
    }

    return true;
  });
}