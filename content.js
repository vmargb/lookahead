const urlParams = new URLSearchParams(window.location.search);
const isExtensionSearch = urlParams.has('la'); // checks if 'la' prefix exists in query


// Only run the extension's logic if the 'la' prefix is present
if (isExtensionSearch) {
// ======================================
// *** LOADING SCREEN STUFF HERE ***
// ======================================
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

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "findBestResult") {
      const query = request.query.toLowerCase();
      const queryWords = query.split(/\s+/).filter(Boolean);

      const results = Array.from(document.querySelectorAll('a[data-testid="result-title-a"]')).slice(0, 10);
      const extractedResults = results
        .map(a => ({ url: a.href, title: a.innerText || '' }))
        .filter(({ url }) => !url.includes("duckduckgo.com"));

      // ======================================
      // *** SMART SCORING LOGIC :D ***
      // ======================================
      function scoreResult(title, url, queryWords) {
        let score = 0;
        const normalizedTitle = title.toLowerCase();
        const normalizedUrl = url.toString().toLowerCase();
        const seenWords = new Set();
        
        // 1. Step 1: standard Keyword Scoring with weighted logic
        queryWords.forEach(word => {
          if (seenWords.has(word)) return;
          const regex = new RegExp(`\\b${word}\\b`, 'i');
          const inTitle = regex.test(normalizedTitle);
          const inUrl = regex.test(normalizedUrl);
          if (inTitle || inUrl) {
            score += inTitle ? 2 : 1;
            seenWords.add(word);
          }
        });
        
        // 2. Step 2: "Domain Bonus" - for official sites
        try {
          const hostname = new URL(url).hostname;
          // get the core domain name (e.g., "twitter" from "www.twitter.com")
          const coreDomain = hostname.replace(/^www\./, '').split('.')[0];
          
          if (queryWords.includes(coreDomain)) {
            score += 10; // the domain boost here
          }
        } catch (e) {
          // ignore invalid URLs
        }

        // Step 3: Tie-breaker: Penalize long and complex URLs
        score -= url.length * 0.01;

        return score;
      }

      let bestScore = -Infinity; // -Infinity for safer comparison
      let bestUrl = null;
      extractedResults.forEach(({ url, title }) => {
        const score = scoreResult(title, url, queryWords);
        console.log(`URL: ${url}, Score: ${score.toFixed(2)}`); // debugging
        if (score > bestScore) {
          bestScore = score;
          bestUrl = url;
        }
      });

      sendResponse({ bestUrl: bestUrl || null });
    }
    return true;
  });
}