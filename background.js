chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.tabs.onActivated.addListener((activeInfo) => {
  showSummary(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId) => {
  showSummary(tabId);
});

async function showSummary(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url || !tab.url.startsWith('http')) {
    return;
  }
  try {
    const injection = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['scripts/extract-content.js'],
    });
    await chrome.storage.session.set({ pageContent: injection[0].result });
  } catch (e) {
    console.error('extract-content failed', e);
    await chrome.storage.session.set({ pageContent: false });
  }
}
