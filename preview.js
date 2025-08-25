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
const engine = urlParams.get('engine') || 'duckduckog';
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
  
  if (displayedResults.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        <h2>No results found</h2>
        <p>Try a different search query</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = displayedResults.map((result, index) => `
    <a href="${result.url}" class="result-item" data-index="${index}" target="_blank">
      <div class="result-score">${result.score.toFixed(1)}</div>
      <div class="result-header">
        <span class="result-rank">${index + 1}</span>
        <div class="result-title">${escapeHtml(result.title)}</div>
      </div>
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
// *** ENABLE TAB CYCLING FOR ***
// ***   PREVIEW MODE HERE    ***
// ======================================
// Opens the selected result URL in 
// the current window (replaces popup).
// Sends the results back to background.js
// for tab cycling
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
    default:
      // Quick-select with number keys (1 to 9)
      const num = parseInt(e.key);
      if (num >= 1 && num <= displayedResults.length) {
        e.preventDefault();
        selectedIndex = num - 1;
        selectResult(selectedIndex);
      }
      break;
  }
});


// Listen for a focus command from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'focusPage') {
    window.focus();
  }
});
