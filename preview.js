// ======================================
// Result Preview Page State
// Manages UI for displaying top search 
// results from DuckDuckGo (or other engine).
// Allows keyboard navigation and selection.
// ======================================
let allResults = []; // the entire result list
let displayedResults = []; // only the displayed results (1 to n)
let selectedIndex = 0;


// ======================================
// Extract Query Parameters from URL
// Parses the query string to determine:
// - Search term (q)
// - Search engine (engine)
// - Number of results to show (count)
// ======================================
const urlParams = new URLSearchParams(window.location.search);
const query = urlParams.get('q') || '';
const engine = urlParams.get('engine') || 'duckduckgo';
const count = parseInt(urlParams.get('count')) || 4;

// display the search query in the UI
document.getElementById('query-display').textContent = `"${query}"`;


// ======================================
// Listens for search results sent by the 
// background script and renders them.
// ======================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'displayResults') {
    allResults = request.results; // complete list
    displayedResults = allResults.slice(0, count); // 1 to n
    displayResults();
  }
  if (request.action === 'focusPage') {
    window.focus();
  }
});


// ======================================
// *** INJECTS RESULT HEADER HERE **
// ======================================
// Render Search Results in UI
// Populates the results container with 
// ranked, scored results. Shows fallback 
// response if no results are available.
// ======================================
function displayResults() {
  const container = document.getElementById('results-container');

  // Clear existing content safely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (displayedResults.length === 0) {
    const wrapper = document.createElement('div');
    wrapper.className = 'no-results';

    const heading = document.createElement('h2');
    heading.textContent = 'No results found';

    const sub = document.createElement('p');
    sub.textContent = 'Try a different search query';

    wrapper.append(heading, sub);
    container.appendChild(wrapper);
    return;
  }

  displayedResults.forEach((result, index) => {
    // Outer link element
    const a = document.createElement('a');
    a.className = 'result-item';
    a.dataset.index = String(index);
    a.href = result.url;       // assigned as property — browser handles encoding
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    // Score badge
    const scoreBadge = document.createElement('div');
    scoreBadge.className = 'result-score';
    scoreBadge.textContent = result.score.toFixed(1);

    // Header row (rank + title)
    const header = document.createElement('div');
    header.className = 'result-header';

    const rank = document.createElement('span');
    rank.className = 'result-rank';
    rank.textContent = String(index + 1);

    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = result.title; // textContent — no HTML parsing, XSS-safe

    header.append(rank, title);

    // URL line
    const urlEl = document.createElement('div');
    urlEl.className = 'result-url';
    urlEl.textContent = result.url; // textContent — safe

    a.append(scoreBadge, header, urlEl);

    // Click handler
    a.addEventListener('click', (e) => {
      e.preventDefault();
      selectResult(index);
    });

    container.appendChild(a);
  });

  updateSelection();
}


// ======================================
// Update Visual Selection Highlight
// ======================================
function updateSelection() {
  document.querySelectorAll('.result-item').forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}


// ======================================
// Select a Result
// Sends selected result + full list back
// to background.js for tab cycling.
// ======================================
function selectResult(index) {
  if (displayedResults[index]) {
    // send a message to background.js
    // background.js will handle changing URL
    chrome.runtime.sendMessage({
      action: 'previewResultSelected',
      results: allResults, // Send the FULL list for the leaderboard
      selectedIndex: index   // Send the index chosen in preview
    });
  }
}


// ======================================
// Keyboard Navigation Handler
// ======================================
document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
      updateSelection();
      break;
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = Math.min(displayedResults.length - 1, selectedIndex + 1);
      updateSelection();
      break;
    case 'Enter':
      e.preventDefault();
      selectResult(selectedIndex);
      break;
    case 'Escape':
      window.close();
      break;
    default: {
      const num = parseInt(e.key);
      if (num >= 1 && num <= displayedResults.length) {
        e.preventDefault();
        selectedIndex = num - 1;
        selectResult(selectedIndex);
      }
      break;
    }
  }
});
