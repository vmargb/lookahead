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
  const previewUrl = chrome.runtime.getURL(`preview.html?q=${encodeURIComponent(query)}&engine=${selectedEngine}&count=${previewCount}`);
  
  chrome.tabs.create({ url: previewUrl, active: true }, (tab) => {
    previewTabId = tab.id;
    
    performSearch(query, selectedEngine, (results) => {
      chrome.tabs.sendMessage(previewTabId, {
        action: 'displayResults',
        results: results
      });
    });
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
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Message failed:', chrome.runtime.lastError.message);
          return;
        }
        
        if (response?.results && response.results.length > 0) {
          currentResults = response.results;
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



// =====================================================================
// *** ALL PREVIEW MODE LOGIC STUFF HERE ***
// =====================================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPreviewResults') {
    performSearch(request.query, request.engine, (results) => {
      sendResponse({ results });
    });
    return true; // keep message channel open for async response
  }
});

function performSearch(query, engine, callback) {
  const searchUrl = SEARCH_ENGINES[engine].url(query);
  // create a background tab to fetch results
  chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
    const tabUpdateListener = (tabId, changeInfo, updatedTab) => {
      if (tabId !== tab.id || changeInfo.status !== 'complete') return;
      
      chrome.tabs.sendMessage(tab.id, { 
        action: "findBestResult", 
        query: query,
        engine: engine 
      }, (response) => {
        chrome.tabs.remove(tab.id); // close the background tab
        
        if (chrome.runtime.lastError) {
          console.error('Message failed:', chrome.runtime.lastError.message);
          callback([]);
          return;
        }
        
        callback(response?.results || []);
      });
      
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
    };
    
    chrome.tabs.onUpdated.addListener(tabUpdateListener);
  });
}
// ==================================================================
// *** END OF PREVIEW MODE ***
// ==================================================================


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