import { scoreAndSortResults } from './scoring.js';

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
// and current index for cycling & preview
// ======================================
let currentResults = [];
let currentIndex = 0;
let currentTabId = null;
let previewTabId = null;


// ======================================
// *** USER PREFERENCES/SETTINGS ***
// ======================================
// Get user's preferences first
// before doing anything crazy
// =============================================
async function getUserSettings() {
  const settings = await chrome.storage.sync.get([
    'searchEngine', 
    'previewMode', 
    'previewCount'
  ]);
  
  return {
    selectedEngine: settings.searchEngine || 'duckduckgo',
    previewMode: settings.previewMode || false,
    previewCount: settings.previewCount || 4
  };
}


// ======================================
// *** PREVIEW MODE HANDLER ***
// ======================================
function handlePreviewMode(query, selectedEngine, previewCount) {
  const searchUrl = SEARCH_ENGINES[selectedEngine].url(query);

  // create a temporary, inactive tab to scrape in the background (active: false)
  chrome.tabs.create({ url: searchUrl, active: false }, (tempTab) => {
    
    const tabUpdateListener = (tabId, changeInfo) => {
      // wait for the temporary tab to finish loading
      if (tabId !== tempTab.id || changeInfo.status !== 'complete') return;
      
      // send a message to content.js to get raw results
      chrome.tabs.sendMessage(tempTab.id, { 
        action: "findBestResult", 
        query: query,
        engine: selectedEngine
      }, (response) => {
        // now that we have the results, close the temporary tab
        chrome.tabs.remove(tempTab.id);

        if (chrome.runtime.lastError || !response?.results) {
          console.error("Could not fetch preview results.", chrome.runtime.lastError?.message);
          return;
        }

        // score and sort the results
        const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
        const scoredResults = scoreAndSortResults(response.results, queryWords);

        // add results to preview.html tab
        const previewUrl = chrome.runtime.getURL(`preview.html?q=${encodeURIComponent(query)}&engine=${selectedEngine}&count=${previewCount}`);
        chrome.tabs.create({ url: previewUrl, active: true }, (previewTab) => {
          previewTabId = previewTab.id;

          // wait for preview.html to be ready to receive the results
          const previewListener = (pTabId, pChangeInfo) => {
            if (pTabId === previewTab.id && pChangeInfo.status === 'complete') {
              chrome.tabs.sendMessage(previewTab.id, {
                action: 'displayResults',
                results: scoredResults
              });
              chrome.tabs.onUpdated.removeListener(previewListener); // clean up this listener
            }
          };
          chrome.tabs.onUpdated.addListener(previewListener);
        });
      });
      
      // Clean up the initial listener
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
    };
    
    chrome.tabs.onUpdated.addListener(tabUpdateListener);
  });
}


// ======================================
// *** INSTANT MODE HANDLER ***
// ======================================
function handleInstantMode(query, selectedEngine) {
  const searchUrl = SEARCH_ENGINES[selectedEngine].url(query);

  chrome.tabs.create({ url: searchUrl, active: true }, (tab) => {
    currentTabId = tab.id;
    
    const tabUpdateListener = (tabId, changeInfo, updatedTab) => {
      if (tabId !== tab.id || changeInfo.status !== 'complete') return;
      
      chrome.tabs.sendMessage(tab.id, { 
        action: "findBestResult", 
        query: query,
        engine: selectedEngine
      }, (response) => { // response contains raw search results
        if (chrome.runtime.lastError) {
          console.error('Message failed:', chrome.runtime.lastError.message);
          return;
        }
        
        if (response?.results && response.results.length > 0) {
          // ** score and sort the raw results here **
          const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
          const scoredResults = scoreAndSortResults(response.results, queryWords);

          currentResults = scoredResults;
          currentIndex = 0;
          chrome.tabs.update(tab.id, { url: currentResults[currentIndex].url });
        } else {
          console.log('No suitable results found');
        }
      });
      
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
    };
    
    chrome.tabs.onUpdated.addListener(tabUpdateListener);
  });
}


// ======================================
// *** OMNIBOX INPUT HANDLER (main) ***
// ======================================
// Listens for user input in the address 
// bar and triggers a DuckDuckGo search.
// On page load completion, sends a message
// to content.js to run the scoring algorithm
// and redirects the tab if all good.
// ======================================
chrome.omnibox.onInputEntered.addListener(async (text) => {
  const { selectedEngine, previewMode, previewCount } = await getUserSettings();
  
  if (previewMode) {
    handlePreviewMode(text, selectedEngine, previewCount);
  } else {
    handleInstantMode(text, selectedEngine);
  }
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
      // tab was closed, reset
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
  if (tabId === previewTabId) {
    previewTabId = null;
  }
});