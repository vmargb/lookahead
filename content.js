// ===========================
// CONTENT.JS (instant mode only)
// ===========================
// The job of this script is just to receive
// the message from background.js and then
// scrape the page such as the URL and title,
// then sends the result back to background.js.
// ======================================

const urlParams = new URLSearchParams(window.location.search);
const isExtensionSearch = urlParams.has('la'); // checks if 'la' prefix exists in query


if (isExtensionSearch) { // only run the extension's logic if the 'la' prefix is present
// ===========================================
// *** LOADING SCREEN ANIMATION STUFF ***
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
        z-index: 9999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        opacity: 0; animation: fadeIn 0.3s ease-in forwards;
      }
      #look-ahead-overlay h1 {
        font-size: 2.5rem; font-weight: 300;
        animation: pulse 1.5s infinite ease-in-out;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
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
      const query = request.query.toLowerCase();
      const engine = request.engine || 'duckduckgo';
      const queryWords = query.split(/\s+/).filter(Boolean);


      // ===================================
      // *** ENGINE SELECTOR ***
      // ==================================
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
      // ======================================
      
      // gets first 10 search results using the selected search engine
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
            // google can have the link as the parent or child
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
          // filter out search engine URLs and ads
          // so they don't pollute the results
          const hostname = new URL(url).hostname;
          return !hostname.includes('google.com') && 
                 !hostname.includes('duckduckgo.com') && 
                 !hostname.includes('bing.com');
        });
      // ======================================
      // ** Send the raw, unscored results back **
      sendResponse({ results: extractedResults });
    }

    return true;
  });
}