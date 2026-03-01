(() => {
  if (globalThis.__splitSource_docInfo) {
    chrome.runtime.sendMessage({
      type: "DOCUMENT_INFO",
      data: globalThis.__splitSource_docInfo,
    });
    return;
  }
  // This runs in the page context
  // You now have access to `document`
  globalThis.__splitSource_docInfo = {
    title: document.title,
    url: document.location.href,
    html: document.documentElement.outerHTML,
    styleSheets: Array.from(document.styleSheets)
      .map((sheet) => sheet.href)
      .filter(Boolean),
    scripts: Array.from(document.scripts)
      .map((script) => script.src)
      .filter(Boolean),
    images: Array.from(document.images)
      .map((img) => img.src)
      .filter(Boolean),
  };

  // Send it back to background
  chrome.runtime.sendMessage({
    type: "DOCUMENT_INFO",
    data: globalThis.__splitSource_docInfo,
  });
})();
