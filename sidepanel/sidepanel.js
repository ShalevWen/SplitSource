(async () => {
  const root = document.getElementById("root");

  const params = new URLSearchParams(globalThis.location?.search ?? "");
  const tabIdParam = params.get("tabId");
  const tabId = tabIdParam ? Number(tabIdParam) : null;

  let tab;
  if (tabId && Number.isFinite(tabId)) {
    tab = await chrome.tabs.get(tabId);
  } else {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }
  chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo) => {
    if (updatedTabId === tab?.id && changeInfo.url) {
      // Reload the side panel when the active tab's URL changes.
      window.location.reload();
    }  });

  if (!tab?.url) {
    root.textContent = "No active tab URL.";
  } else if (!/^https?:/i.test(tab.url)) {
    root.textContent = `Unsupported URL: ${tab.url}`;
  } else {
    // Chrome does not allow embedding `view-source:` in an iframe in extension pages.
    // Instead, render the page source directly (equivalent to view-source for most uses).
    root.textContent = `view-source:${tab.url}\n\nLoading…`;
    try {
      const res = await fetch(tab.url, { credentials: "include" });
      const text = await res.text();
      root.textContent = text;
      window.PR.prettyPrint();
    } catch (err) {
      root.textContent = `Failed to load source: ${err?.message ?? String(err)}`;
    }
  }
})();
