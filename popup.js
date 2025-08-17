document.addEventListener('DOMContentLoaded', async () => {
  const searchEngineSelect = document.getElementById('search-engine');
  const previewModeToggle = document.getElementById('preview-mode');
  const previewCountInput = document.getElementById('preview-count');
  const previewCountContainer = document.getElementById('preview-count-container');
  
  // Load saved settings
  const result = await chrome.storage.sync.get([
    'searchEngine', 
    'previewMode', 
    'previewCount'
  ]);
  
  if (result.searchEngine) {
    searchEngineSelect.value = result.searchEngine;
  }
  
  if (result.previewMode !== undefined) {
    previewModeToggle.checked = result.previewMode;
  }
  
  if (result.previewCount !== undefined) {
    previewCountInput.value = result.previewCount;
  } else {
    previewCountInput.value = 4; // default
  }
  
  // Update preview count container visibility
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