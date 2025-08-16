// background.js

chrome.omnibox.onInputEntered.addListener((text) => {
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(text)}&la=1`;

  chrome.tabs.create({ url: searchUrl, active: true }, (tab) => {
    function tabUpdateListener(tabId, changeInfo, updatedTab) {
      // We only want to message the tab when it's fully loaded
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.sendMessage(tab.id, { action: "findBestResult", query: text }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Message failed:', chrome.runtime.lastError.message);
            // Optionally close the loading tab if something goes wrong
            // chrome.tabs.remove(tab.id); 
            return;
          }

          if (response?.bestUrl) {
            // Update the current tab instead of creating a new one
            chrome.tabs.update(tab.id, { url: response.bestUrl });
          } else {
            console.log('No suitable results found');
            // If no result is found, we can either leave the DDG page
            // or close the tab. For now, we'll leave it.
          }
        });
        // rmove the listener to prevent it from running again
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      }
    }

    chrome.tabs.onUpdated.addListener(tabUpdateListener);
  });
});