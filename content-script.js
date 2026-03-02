(() => {
  if (globalThis.__splitSource_docInfo) {
    chrome.runtime.sendMessage({
      type: "DOCUMENT_INFO",
      data: globalThis.__splitSource_docInfo,
    });
    return;
  }

  const pageOrigin = document.location.origin;

  const isAllowedResourceUrl = (urlString) => {
    if (typeof urlString !== "string" || urlString.length === 0) return false;
    if (urlString.startsWith("data:")) return true;

    try {
      const url = new URL(urlString, document.location.href);
      return url.origin === pageOrigin;
    } catch {
      return false;
    }
  };

  const uniqueStrings = (arr) => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    for (const v of arr) {
      if (typeof v !== "string" || v.length === 0) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  };

  // This runs in the page context
  // You now have access to `document`
  globalThis.__splitSource_docInfo = {
    title: document.title,
    url: document.location.href,
    html: document.documentElement.outerHTML,
    styleSheets: uniqueStrings(
      Array.from(document.styleSheets)
        .map((sheet) => sheet.href)
        .filter(Boolean)
        .filter(isAllowedResourceUrl),
    ),
    scripts: uniqueStrings(
      Array.from(document.scripts)
        .map((script) => script.src)
        .filter(Boolean)
        .filter(isAllowedResourceUrl),
    ),
    images: uniqueStrings(
      Array.from(document.images)
        .map((img) => img.src)
        .filter(Boolean)
        .filter(isAllowedResourceUrl),
    ),
    links: uniqueStrings(
      Array.from(document.links)
        .map((a) => a.getAttribute("href") || a.href)
        .filter(Boolean)
        .filter(isAllowedResourceUrl),
    ),
  };

  // Send it back to background
  chrome.runtime.sendMessage({
    type: "DOCUMENT_INFO",
    data: globalThis.__splitSource_docInfo,
  });
})();
