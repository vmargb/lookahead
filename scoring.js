// ======================================
// *** SMART SCORING LOGIC :D ***
// ======================================

/**
 * Extract search results from the page document.
 * Handles DuckDuckGo, Google, and Bing result structures.
 */
export function extractResults(doc, engine) {
  const SELECTORS = {
    duckduckgo: 'a[data-testid="result-title-a"]',
    google: 'h3 a, a h3'
  };

  const selector = SELECTORS[engine];
  if (!selector) return [];

  const results = Array.from(doc.querySelectorAll(selector)).slice(0, 10);

  return results
    .map(a => {
      let url, title;
      if (engine === 'google') {
        // Handle Google's nested or parent-linked structure
        url = a.href || a.parentElement?.href;
        title = a.innerText || a.textContent || '';
      } else {
        url = a.href;
        title = a.innerText || a.textContent || '';
      }

      // Resolve Google tracking URLs like /url?q=...
      if (url && url.startsWith('https://www.google.com/url?')) {
        try {
          const parsed = new URL(url);
          const realUrl = parsed.searchParams.get('q');
          if (realUrl && realUrl.startsWith('http')) {
            url = realUrl;
          }
        } catch (e) {
          // fallback to original if parsing fails
        }
      }

      return { url, title };
    })
    .filter(({ url, title }) => {
      if (!url || !title) return false;
      try {
        const hostname = new URL(url).hostname;
        // Block search engine self-links
        return !hostname.includes('google.com') &&
               !hostname.includes('duckduckgo.com') &&
               !hostname.includes('bing.com');
      } catch (e) {
        return false; // invalid URL
      }
    });
}


export function scoreResult(title, url, queryWords, position=0) {
  let score = 0;
  const normalizedTitle = title.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  const seenWords = new Set();

  // Escape special regex characters in query words
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Step 1: keyword Matching (Title < URL)
  queryWords.forEach(word => {
    if (seenWords.has(word)) return;

    const escapedWord = escapeRegex(word);
    const regex = new RegExp(`\\b${escapedWord}\\b`);

    const inTitle = regex.test(normalizedTitle);
    const inUrl = regex.test(normalizedUrl);

    if (inTitle || inUrl) {
      score += inTitle ? 1 : 2; // weighted score for url match
      seenWords.add(word);
    }
  });

  // Step 2: domain Boost (Only if domain matches a query word exactly)
  try {
    const hostname = new URL(url).hostname;
    const coreDomain = hostname.replace(/^www\./, '').split('.')[0].toLowerCase();

    // only boost if the domain name is *exactly* a query word (e.g., "twitter" in "twitter.com")
    if (queryWords.includes(coreDomain)) {
      score += 3; // Reduced from 10 to avoid over-prioritizing
    }
  } catch (e) {
    // Ignore invalid URLs
  }

  // Step 3: Penalize Low-Quality Domains
  const LOW_QUALITY_PATTERNS = [
    'blogspot.', 'wordpress.', 'wix.', 'weebly.', 'tumblr.',
    'info.', 'free.', 'online.', 'best.', 'top', 'review',
    '.xyz', '.info', '.biz', '.club'
  ];

  const isLowQuality = LOW_QUALITY_PATTERNS.some(pattern =>
    url.includes(pattern)
  );

  if (isLowQuality) {
    score -= 2;
  }

  // Step 4: Penalize URL Complexity (as well as length)
  const paramCount = (url.match(/\?[^#]*/g) || [''])[0].length; // length of query string
  const depth = (url.split('/').length - 3); // number of path segments beyond domain
  const encodedChars = (url.match(/%[0-9A-Fa-f]{2}/g) || []).length;

  score -= paramCount * 0.02;
  score -= Math.max(0, depth - 3) * 0.5; // penalize deep nesting
  score -= encodedChars * 1.5;

  // Step 5: Position Bonus
  if (position === 0) {
    score += 1.0; // Top result gets biggest boost
  } else if (position < 3) {
    score += 0.7; // Top 3
  } else if (position < 6) {
    score += 0.4; // Top 6
  }

  return score;
}

// =================================
// ** SCORE AND SORT RESULTS **
// =================================
// Goes through each result and scores it
// using the scoreResult function.
// Sorts the results by score in descending order.
// saves the scores as a "leaderboard" to be
// cycled through in the background script.
// =================================
export function scoreAndSortResults(results, queryWords) {
  return results
    .map(({ url, title }, index) => ({

      url,
      title,
      score: scoreResult(title, url, queryWords, index)
    }))
    .sort((a, b) => b.score - a.score);
}