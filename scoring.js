// ======================================
// *** SMART SCORING LOGIC :D ***
// ======================================

export function extractResults(doc, engine) {
  const SELECTORS = {
    duckduckgo: 'a[data-testid="result-title-a"]',
    google: 'h3 a, a h3',
    bing: 'h2 a'
  };

  const selector = SELECTORS[engine];
  if (!selector) return [];

  const results = Array.from(doc.querySelectorAll(selector)).slice(0, 10);

  return results
    .map(a => {
      let url, title;
      if (engine === 'google') { // google can have the link as the parent or child
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
}

export function scoreResult(title, url, queryWords) {
  let score = 0;
  const normalizedTitle = title.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  const seenWords = new Set(); // prevent double-counting with a set

  // step 1: standard Keyword Scoring with weighted logic
  queryWords.forEach(word => {
    if (seenWords.has(word)) return;
    const regex = new RegExp(`\\b${word}\\b`, 'i');
    const inTitle = regex.test(normalizedTitle);
    const inUrl = regex.test(normalizedUrl);
    if (inTitle || inUrl) {
      score += inTitle ? 2 : 1; // weighted score if its in the title

      seenWords.add(word);
    }
  });

  // step 2: "Domain Bonus" - for official sites
  try {
    const hostname = new URL(url).hostname;
    // get the core domain name (e.g., "twitter" from "www.twitter.com")
    const coreDomain = hostname.replace(/^www\./, '').split('.')[0];
    if (queryWords.includes(coreDomain)) score += 10; // the domain boost here
  } catch (e) {}

  // step 3: Tie-breaker: Penalize long and complex URLs
  score -= url.length * 0.01;
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
    .map(({ url, title }) => ({
      url,
      title,
      score: scoreResult(title, url, queryWords)
    }))
    .sort((a, b) => b.score - a.score);
}
