chrome.sidePanel.setOptions?.({
  enabled: false,
});

function openSidePanelForTab(tab) {
  if (!tab?.id) return;
  chrome.sidePanel.setOptions?.({
    tabId: tab.id,
    path: `sidepanel/sidepanel.html?tabId=${encodeURIComponent(tab.id)}`,
    enabled: true,
  });
  chrome.sidePanel.open({ tabId: tab.id });
}

chrome.action.onClicked.addListener((tab) => {
  openSidePanelForTab(tab);
});
