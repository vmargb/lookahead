import { scoreAndSortResults } from './scoring.js';

// ======================================
// *** NOTES ***
// ======================================
// cycling not enabled by default in preview mode
// only enabled after user selects a site in preview.html
// preview.html needs to send a message back to background.js


// Define the rules that will add the `la=1` parameter to searches in automatic mode
const AUTO_MODE_RULES = [
  {
    id: 1,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: "https://www.google.com/search\\1&la=1"
      }
    },
    condition: {
      // Only match if query string exists AND no 'la=' already
      regexFilter: "^https://www\\.google\\.com/search(\\?[^#]*)(?<![?&]la=1)(?=$|#)",
      resourceTypes: ["main_frame"]
    }
  },
  {
    id: 2,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: "https://duckduckgo.com/\\1&la=1"
      }
    },
    condition: {
      regexFilter: "^https://duckduckgo\\.com/(\\?[^#]*)(?<![?&]la=1)(?=$|#)",
      resourceTypes: ["main_frame"]
    }
  },
  {
    id: 3,
    priority: 1,
    action: {
      type: "redirect",
      redirect: {
        regexSubstitution: "https://www.bing.com/search\\1&la=1"
      }
    },
    condition: {
      regexFilter: "^https://www\\.bing\\.com/search(\\?[^#]*)(?<![?&]la=1)(?=$|#)",
      resourceTypes: ["main_frame"]
    }
  }
];



// ======================================
// *** SEARCH ENGINE CONFIG stuff here ***
// ======================================
const SEARCH_ENGINES = {
  duckduckgo: {
    url: (query) => {
      const base = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
      return base + '&la=1';
    },
    name: 'DuckDuckGo'
  },
  google: {
    url: (query) => {
      const base = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      return base + '&la=1';
    },
    name: 'Google'
  },
  bing: {
    url: (query) => {
      const base = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
      return base + '&la=1';
    },
    name: 'Bing'
  }
};


// ======================================
// Storage for current search results
// and current index for cycling & preview
// ======================================
let currentResults = []; // scored results in order
let currentIndex = 0; // current position
let currentTabId = null; // only allow cycling in this tab
let previewTabId = null;
let processedSearchTabs = new Set(); // prevents re-triggering global listener on same tab!


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


// This function checks the setting and enables/disables the rules.
async function updateAutoModeRules() {
  // Get the current setting, defaulting to `true` (manual mode).
  const { useOmniboxKeyword } = await chrome.storage.sync.get({ useOmniboxKeyword: true });

  // When the switch is OFF (`useOmniboxKeyword` is false), we are in Automatic Mode.
  if (!useOmniboxKeyword) {
    console.log('Lookahead: Automatic mode enabled. Adding redirect rules.');
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1, 2, 3], // First remove any existing rules to be safe.
      addRules: AUTO_MODE_RULES
    });
  } else {
    // When the switch is ON (`useOmniboxKeyword` is true), we are in Manual Mode.
    console.log('Lookahead: Manual mode enabled. Removing redirect rules.');
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1, 2, 3]
    });
  }
}

// Run the function when the extension is first installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  updateAutoModeRules();
});

// Run the function whenever the user changes the setting in the popup.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.useOmniboxKeyword) {
    updateAutoModeRules();
  }
});


// ======================================
// *** PREVIEW MODE HANDLER ***
// ======================================
async function handlePreviewModeFromTab(tabId, query, engine, previewCount) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: "findBestResult", query, engine });
    if (!response?.results) return console.error("Could not fetch preview results");

    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scoredResults = scoreAndSortResults(response.results, queryWords);

    const previewUrl = chrome.runtime.getURL(
      `preview.html?q=${encodeURIComponent(query)}&engine=${engine}&count=${previewCount}`
    );

    chrome.tabs.create({ url: previewUrl, active: true }, previewTab => {
      previewTabId = previewTab.id;
      const listener = (pTabId, changeInfo) => {
        if (pTabId === previewTab.id && changeInfo.status === "complete") {
          chrome.tabs.sendMessage(previewTab.id, { action: "displayResults", results: scoredResults });
          chrome.tabs.onUpdated.removeListener(listener);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    chrome.tabs.remove(tabId);
  } catch (err) {
    console.error("Error in handlePreviewModeFromTab:", err);
  }
}


// Handles preview in manual (omnibox keyword) mode
async function handlePreviewModeManual(query, engine, previewCount) {
  const searchUrl = SEARCH_ENGINES[engine].url(query);

  // Open a temporary search tab (inactive)
  chrome.tabs.create({ url: searchUrl, active: false }, (tab) => {
    const tabId = tab.id;

    const listener = async (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);

        // Now we have a valid tabId to fetch results from
        handlePreviewModeFromTab(tabId, query, engine, previewCount);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}



// ======================================
// *** INSTANT MODE HANDLER MANUAL ***
// ======================================
// This function is called when the user manually types "la" in the omnibox.
// It opens a new tab with the search query and waits for the page to load.
// Once the page is loaded, it sends a message to the content script to find the best result.
// If a result is found, it updates the current tab with the result's URL.
function handleInstantModeManual(query, selectedEngine) {
  const searchUrl = SEARCH_ENGINES[selectedEngine].url(query);

  chrome.tabs.create({ url: searchUrl, active: true }, (tab) => {
    currentTabId = tab.id;
    
    const tabUpdateListener = (tabId, changeInfo, updatedTab) => {
      if (tabId !== tab.id || changeInfo.status !== 'complete') return;
      
      chrome.tabs.sendMessage(tab.id, { 
        action: "findBestResult", 
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



async function sendMessageWithRetry(tabId, message, retries = 5, delay = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      if (response) return response;
    } catch (e) {
      if (!e.message.includes("Receiving end does not exist")) console.error(e);
    }
    await new Promise(r => setTimeout(r, delay));
  }
  console.warn(`Failed to send message to tab ${tabId} after ${retries} retries`);
  return null;
}



// =================================================================
// *** GLOBAL LISTENER FOR ANY TAB CHANGES ***
// ***     AUTOMATIC MODE ONLY!!!!         ***
// =================================================================
// This listener exists for one purpose only:
// to be able to execute searches that do not have
// the 'la' prefix in the URL (aka automatic mode)
// =================================================================
// Notices you’ve opened a search page.
// Waits for the page to fully load.
// Checks if it’s one of your searches (la tag).
// Prevents duplicates (so it doesn’t run twice).
// Decides whether to show a preview or go straight to the best result.
// If "instant mode" is on, it finds the best result and redirects the tab to that page — all automatically.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const { useOmniboxKeyword } = await chrome.storage.sync.get({ useOmniboxKeyword: true });
  if (useOmniboxKeyword) { // check if "la" keyword enabled
    return; // if manual mode is ON, this listener should do nothing
  }

  // only continue when tab fully loaded, it has a url, and you're on it
  if (changeInfo.status !== "complete" || !tab.url || !tab.active) return;

  // only continue if URL has the keyword "la" in it
  // even if user doesn't type 'la' it is injected into the
  // url in "SEARCH_ENGINES" to allow automatic search to work
  const url = new URL(tab.url);
  if (!url.searchParams.has("la")) return;

  // Prevents listener from activating twice on same tab
  // after we make a change to the tab (e.g. redirect)
  const searchKey = `${tabId}-${url.searchParams.get("q") || ""}`;
  if (processedSearchTabs.has(searchKey)) return;
  processedSearchTabs.add(searchKey); // adds tab to seen
  // This stops the extension from trying to redirect the same tab over and over. 

  // get users preferences first to see how to handle the search
  // like search engine, prievew mode or instant mode
  const { previewMode, selectedEngine, previewCount } = await getUserSettings();
  const engine = Object.keys(SEARCH_ENGINES).find(k => url.hostname.includes(k)) || "duckduckgo";
  const query = url.searchParams.get("q") || "";


  // allows preview mode to work with automatic mode enabled
  // if user manually types "la" then it runs handlePreviewModeManual
  // in the omnibox listener, otherwise we run it here instead
  if (previewMode) {
    handlePreviewModeFromTab(tabId, query, engine, previewCount);
    return;
  }

  try {
      const response = await sendMessageWithRetry(tabId, {
        action: "findBestResult",
        engine: engine,
        query: query
      });
      if (response?.results?.length) {
          const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
          const scoredResults = scoreAndSortResults(response.results, queryWords);

          currentTabId = tabId;
          currentResults = scoredResults;
          currentIndex = 0;

          // Remove from processed set before navigation to allow future searches
          processedSearchTabs.delete(searchKey);
          chrome.tabs.update(tabId, { url: scoredResults[0].url });
      } else {
          console.log("No suitable results, leaving search page.");
          processedSearchTabs.delete(searchKey);
      }
  } catch (error) {
      console.error(error);
      processedSearchTabs.delete(searchKey);
  }
});



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
    // Use the new helper for manual mode
    handlePreviewModeManual(text, selectedEngine, previewCount);
  } else {
    handleInstantModeManual(text, selectedEngine);
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
// *** PREVIEW.JS LISTENER ***  
// ===========================================
// listens for a tab to picked in preview.JS
// preview.js will send which tab was picked
// back to us and the index of the tab so that
// tab cycling can be enabled by updating the variables
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'previewResultSelected') {
    // now set the global variables to enable keyboard shortcuts.
    currentResults = request.results;
    currentIndex = request.selectedIndex;
    currentTabId = sender.tab.id; // the ID of the tab that sent the message (the preview tab)

    // manually navigate the tab to the chosen URL
    chrome.tabs.update(currentTabId, { url: currentResults[currentIndex].url });
  }
});



// ===========================================
// *** CLEANUP: Reset state when tab is closed ***  
// ===========================================
chrome.tabs.onRemoved.addListener((tabId) => {
  // Remove any entries for this tab
  for (const key of processedSearchTabs) {
    if (key.startsWith(`${tabId}-`)) {
      processedSearchTabs.delete(key);
    }
  }
  
  // Your existing cleanup code
  if (tabId === currentTabId) {
    currentResults = [];
    currentTabId = null;
    currentIndex = 0;
  }
  if (tabId === previewTabId) {
    previewTabId = null;
  }
});