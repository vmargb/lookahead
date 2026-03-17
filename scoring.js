// ======================================
// *** SMART SCORING LOGIC :D ***
// ======================================

/**
 * extract search results from the page document.
 * Handles DuckDuckGo, Google, and Startpage result structures.
 */
export function extractResults(doc, engine) {
  const SELECTORS = {
    duckduckgo: 'a[data-testid="result-title-a"]',
    google: 'h3 a, a h3',
    startpage: 'a.result-link'
  };

  const selector = SELECTORS[engine];
  if (!selector) return [];

  const results = Array.from(doc.querySelectorAll(selector)).slice(0, 10);

  return results
    .map(a => {
      let url, title;
      if (engine === 'google') {
        url = a.href || a.parentElement?.href;
        title = a.innerText || a.textContent || '';
      } else {
        url = a.href;
        title = a.innerText || a.textContent || '';
      }

      // resolve Google tracking URLs like /url?q=...
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
        return !hostname.includes('google.com') &&
               !hostname.includes('duckduckgo.com') &&
               !hostname.includes('startpage.com');
      } catch (e) {
        return false;
      }
    });
}


// ======================================
// *** DOMAIN INTENT DETECTION ***
// ======================================
// detects if the user typed a specific domain in their query (e.g. "u.gg builds")
// returns the intended hostname if found, otherwise null
// ======================================
function detectExplicitDomainIntent(queryWords) {
  const TLD_PATTERN = /^[a-z0-9-]+\.[a-z]{2,}$/i;
  for (const word of queryWords) {
    if (TLD_PATTERN.test(word)) {
      return word.toLowerCase();
    }
  }
  return null;
}


export function scoreResult(title, url, queryWords, position = 0) {
  let score = 0;
  const normalizedTitle = title.toLowerCase();
  const normalizedUrl = url.toLowerCase();

  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let hostname = '';
  let coreDomain = '';
  try {
    hostname = new URL(url).hostname.toLowerCase();
    coreDomain = hostname.replace(/^www\./, '');
  } catch (e) {
    // ignore invalid URLs
  }


  // ======================================
  // Step 1: Explicit Domain Intent (Highest Priority)
  // ======================================
  // if the user typed a domain term (e.g. "u.gg"), give a strong boost
  // to results whose hostname matches this is the clearest possible signal
  // of user intent and should almost always win
  // ======================================
  const intendedDomain = detectExplicitDomainIntent(queryWords);
  if (intendedDomain && coreDomain) {
    if (coreDomain === intendedDomain || coreDomain.endsWith('.' + intendedDomain)) {
      score += 8; // strong explicit intent — this is what the user asked for
    }
  }


  // ======================================
  // Step 2: Keyword Matching (Title + URL)
  // ======================================
  // URL matches are weighted higher than title matches because a keyword
  // in the URL signals the page is specifically about that topic rather
  // than just mentioning it. Both title and URL matching the same word
  // is a strong signal of topical relevance
  // ======================================
  const seenWords = new Set();

  queryWords.forEach(word => {
    if (seenWords.has(word)) return;

    // skip words that look like domain names — already handled above
    if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(word)) return;

    const escaped = escapeRegex(word);
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');

    const inTitle = regex.test(normalizedTitle);
    const inUrl = regex.test(normalizedUrl);

    if (inTitle && inUrl) {
      score += 2.5; // appears in both — strong relevance signal
    } else if (inUrl) {
      score += 2.0; // URL match — page is likely specifically about this
    } else if (inTitle) {
      score += 1.0; // title match — page mentions this topic
    }

    if (inTitle || inUrl) seenWords.add(word);
  });


  // ======================================
  // Step 3: Phrase Match Bonus
  // ======================================
  // if the full query (or most of it) appears as a phrase in the title,
  // that's a much stronger relevance signal than individual word hits
  // ======================================
  const contentWords = queryWords.filter(w => !/^[a-z0-9-]+\.[a-z]{2,}$/i.test(w));
  if (contentWords.length >= 2) {
    const phrase = contentWords.join(' ').toLowerCase();
    if (normalizedTitle.includes(phrase)) {
      score += 2.0; // exact phrase in title is a strong match
    }
  }


  // ======================================
  // Step 4: Position Bonus
  // ======================================
  // the search engines ranking is generally reliable it's the result of
  // a much more sophisticated algorithm. We give significant weight
  // to position so we don't override it without a good reason
  // ======================================
  if (position === 0) {
    score += 2.5;
  } else if (position === 1) {
    score += 2.0;
  } else if (position === 2) {
    score += 1.5;
  } else if (position < 5) {
    score += 1.0;
  } else if (position < 8) {
    score += 0.5;
  }


  // ======================================
  // Step 5: Penalize Low-Quality Domains
  // ======================================
  // checks hostname segments rather than URL substrings to avoid
  // false positives (e.g. 'top' matching 'topcoder.com')
  // ======================================
  const LOW_QUALITY_HOSTS = [
    'blogspot.com', 'wordpress.com', 'wix.com', 'weebly.com',
    'tumblr.com', 'tripod.com', 'angelfire.com'
  ];

  const LOW_QUALITY_TLDS = ['.xyz', '.info', '.biz', '.club', '.tk', '.ml'];

  if (LOW_QUALITY_HOSTS.some(h => coreDomain === h || coreDomain.endsWith('.' + h))) {
    score -= 2;
  }
  if (LOW_QUALITY_TLDS.some(tld => coreDomain.endsWith(tld))) {
    score -= 2;
  }


  // ======================================
  // Step 6: Penalize URL Complexity
  // ======================================
  // long query strings and percent-encoded characters indicate
  // tracking links, session URLs, or dynamically generated pages
  // that are less likely to be the right resource
  // ======================================
  const queryString = (url.match(/\?[^#]*/) || [''])[0];
  const depth = url.split('/').length - 3;
  const encodedChars = (url.match(/%[0-9A-Fa-f]{2}/g) || []).length;

  score -= queryString.length * 0.015;
  score -= Math.max(0, depth - 4) * 0.3;
  score -= encodedChars * 1.5;

  return score;
}


// =================================
// ** SCORE AND SORT RESULTS **
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
