// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const searchEngineSelect = document.getElementById('search-engine');
  
  // Load saved settings
  const result = await chrome.storage.sync.get(['searchEngine']);
  if (result.searchEngine) {
    searchEngineSelect.value = result.searchEngine;
  }
  
  // Save settings when changed
  searchEngineSelect.addEventListener('change', async () => {
    await chrome.storage.sync.set({
      searchEngine: searchEngineSelect.value
    });
  });
});