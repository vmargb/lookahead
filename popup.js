document.addEventListener('DOMContentLoaded', async () => {
  const searchEngineSelect = document.getElementById('search-engine');
  const useOmniboxKeyword = document.getElementById('use-omnibox-keyword');
  const previewModeToggle = document.getElementById('preview-mode');
  const previewCountInput = document.getElementById('preview-count');
  const previewCountContainer = document.getElementById('preview-count-container');
  
  // Load saved settings
  const result = await chrome.storage.sync.get([
    'searchEngine', 
    'previewMode', 
    'previewCount',
    'useOmniboxKeyword'
  ]);
  
  if (result.searchEngine) {
    searchEngineSelect.value = result.searchEngine;
  }

  if (result.useOmniboxKeyword !== undefined) {
    useOmniboxKeyword.checked = result.useOmniboxKeyword;
  } else {
    useOmniboxKeyword.checked = true; // default enabled
  }
  
  if (result.previewMode !== undefined) {
    previewModeToggle.checked = result.previewMode;
  }
  
  if (result.previewCount !== undefined) {
    previewCountInput.value = result.previewCount;
  } else {
    previewCountInput.value = 4; // default
  }
  
  // update preview count container visibility
  function updatePreviewCountVisibility() {
    if (previewModeToggle.checked) {
      previewCountContainer.classList.add('enabled');
    } else {
      previewCountContainer.classList.remove('enabled');
    }
  }
  
  updatePreviewCountVisibility();
  
  // Save settings when changed
  searchEngineSelect.addEventListener('change', async () => {
    await chrome.storage.sync.set({
      searchEngine: searchEngineSelect.value
    });
  });

  // checked = true means "Manual Mode" is ON.
  // checked = false means "Automatic Mode" is ON.
  useOmniboxKeyword.addEventListener('change', () => {
    chrome.storage.sync.set({ useOmniboxKeyword: useOmniboxKeyword.checked });
  });
  
  previewModeToggle.addEventListener('change', async () => {
    await chrome.storage.sync.set({
      previewMode: previewModeToggle.checked
    });
    updatePreviewCountVisibility();
  });
  
  previewCountInput.addEventListener('change', async () => {
    await chrome.storage.sync.set({
      previewCount: parseInt(previewCountInput.value)
    });
  });
});