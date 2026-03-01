(() => {
  if (globalThis.__splitSource_docInfo) {
    chrome.runtime.sendMessage({
      type: "DOCUMENT_INFO",
      data: globalThis.__splitSource_docInfo,
    });
    return;
  }

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
        .filter(Boolean),
    ),
    scripts: uniqueStrings(
      Array.from(document.scripts)
        .map((script) => script.src)
        .filter(Boolean),
    ),
    images: uniqueStrings(
      Array.from(document.images)
        .map((img) => img.src)
        .filter(Boolean),
    ),
  };
  console.log(globalThis.__splitSource_docInfo)
  // Send it back to background
  chrome.runtime.sendMessage({
    type: "DOCUMENT_INFO",
    data: globalThis.__splitSource_docInfo,
  });
})();
