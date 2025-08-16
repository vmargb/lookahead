// ======================================
// *** SEARCH ENGINE CONFIG stuff here ***
// ======================================
const SEARCH_ENGINES = {
  duckduckgo: {
    url: (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}&la=1`,
    name: 'DuckDuckGo'
  },
  google: {
    url: (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}&la=1`,
    name: 'Google'
  },
  bing: {
    url: (query) => `https://www.bing.com/search?q=${encodeURIComponent(query)}&la=1`,
    name: 'Bing'
  }
};

// ======================================
// Storage for current search results
// and current index
// ======================================
let currentResults = [];
let currentIndex = 0;
let currentTabId = null;
// ======================================


// ======================================
// *** Omnibox Input Handler ***
// Listens for user input in the address 
// bar and triggers a DuckDuckGo search.
//
// On page load completion, sends a message
// to content.js to run the scoring algorithm
// and redirects the tab if all good.
// ======================================
chrome.omnibox.onInputEntered.addListener(async (text) => {
  const result = await chrome.storage.sync.get(['searchEngine']); // get preferred search engine first
  const selectedEngine = result.searchEngine || 'duckduckgo';
  const searchUrl = SEARCH_ENGINES[selectedEngine].url(text);

  chrome.tabs.create({ url: searchUrl, active: true }, (tab) => {
    currentTabId = tab.id; // for tracking the tabs
    
    function tabUpdateListener(tabId, changeInfo, updatedTab) {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.sendMessage(tab.id, { 
          action: "findBestResult", 
          query: text,
          engine: selectedEngine 
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Message failed:', chrome.runtime.lastError.message);
            return;
          }
          
          if (response?.results && response.results.length > 0) {
            currentResults = response.results; // store results for navigation
            currentIndex = 0; // start on first tab

            
            // Navigate to the best result
            chrome.tabs.update(tab.id, { url: currentResults[currentIndex].url });
          } else {
            console.log('No suitable results found');
          }
        });
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      }
    }
    chrome.tabs.onUpdated.addListener(tabUpdateListener);
  });
});




// ======================================
// *** HANDLE KEYBOARD SHORTCUTS *** 
// ======================================
// Listens for registered hotkeys (e.g., 
// next/previous result) and navigates 
// through the stored search results.
// Skips execution if no results are available
// or if the target tab has been closed.
// ======================================
chrome.commands.onCommand.addListener((command) => {
  if (!currentResults.length || !currentTabId) return;
  
  chrome.tabs.get(currentTabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      // Tab was closed, reset
      currentResults = [];
      currentTabId = null;
      return;
    }
    
    if (command === 'next-result') {
      currentIndex = (currentIndex + 1) % currentResults.length;
      chrome.tabs.update(currentTabId, { url: currentResults[currentIndex].url });
    } else if (command === 'previous-result') {
      currentIndex = (currentIndex - 1 + currentResults.length) % currentResults.length;
      chrome.tabs.update(currentTabId, { url: currentResults[currentIndex].url });
    }
  });
});



// ===========================================
// *** CLEANUP: Reset state when tab is closed ***  
// ===========================================
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === currentTabId) {
    currentResults = [];
    currentTabId = null;
    currentIndex = 0;
  }
});