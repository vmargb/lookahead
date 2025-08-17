// ======================================
// Result Preview Page State
// Manages UI for displaying top search 
// results from DuckDuckGo (or other engine).
// Allows keyboard navigation and selection.
// ======================================
let results = [];
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
const engine = urlParams.get('engine') || 'duckduckog';
const count = parseInt(urlParams.get('count')) || 4;


// display the search query in the UI
document.getElementById('query-display').textContent = `"${query}"`;


// ======================================
// Listen for Results from Background
// Receives search results sent by the 
// background script and renders them.
// ======================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'displayResults') {
    results = request.results.slice(0, count);
    displayResults();
  }
});


// ======================================
// Render Search Results in UI
// Populates the results container with 
// ranked, scored results. Shows fallback 
// if no results are available.
// ======================================
function displayResults() {
  const container = document.getElementById('results-container');
  
  if (results.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        <h2>No results found</h2>
        <p>Try a different search query</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = results.map((result, index) => `
    <a href="${result.url}" class="result-item" data-index="${index}" target="_blank">
      <div class="result-rank">${index + 1}</div>
      <div class="result-score">${result.score.toFixed(1)}</div>
      <div class="result-title">${escapeHtml(result.title)}</div>
      <div class="result-url">${result.url}</div>
    </a>
  `).join('');
  

  // ======================================
  // Attach Click Listeners to Results
  // Enables mouse selection of results.
  // Prevents default navigation and uses
  // custom selection logic.
  // ======================================
  document.querySelectorAll('.result-item').forEach((item, index) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      selectResult(index);
    });
  });
  
  updateSelection();
}


// ======================================
// Update Visual Selection Highlight
// Applies 'selected' class to current 
// result and scrolls it into view.
// Removes selection from others.
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
// Handle Result Selection
// Opens the selected result URL in 
// the current window (replaces popup).
// ======================================
function selectResult(index) {
  if (results[index]) {
    window.open(results[index].url, '_self');
  }
}


// ======================================
// Prevents XSS(cross-site scripting) by
// escaping special characters in result titles.
// ======================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ======================================
// Keyboard Navigation Handler
// Supports:
// - Arrow keys: Move selection
// - Enter: Open selected result
// - Escape: Close popup
// - Number keys (1–9): Jump to result
// ======================================
document.addEventListener('keydown', (e) => {
  switch(e.key) {
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
      updateSelection();
      break;
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = Math.min(results.length - 1, selectedIndex + 1);
      updateSelection();
      break;
    case 'Enter':
      e.preventDefault();
      selectResult(selectedIndex);
      break;
    case 'Escape':
      window.close();
      break;
    default:
      // Quick-select with number keys (1 to 9)
      const num = parseInt(e.key);
      if (num >= 1 && num <= results.length) {
        e.preventDefault();
        selectedIndex = num - 1;
        selectResult(selectedIndex);
      }
      break;
  }
});


// ======================================
// Request Initial Search Results
// Asks background script to fetch and 
// return top results for the query.
// Triggers display upon receipt.
// ======================================
chrome.runtime.sendMessage({ 
  action: 'getPreviewResults', 
  query, 
  engine, 
  count 
});
// ======================================