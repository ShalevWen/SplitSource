const NEW_PREFIX = "extrasPage_v1:";
const OLD_STORAGE_KEY = "extrasByPageUrl_v1";

const isHttpUrl = (url) => typeof url === "string" && /^https?:/i.test(url);

const normalizeExtras = (extras) => {
  if (!Array.isArray(extras)) return [];
  const out = [];
  const seen = new Set();
  for (const v of extras) {
    if (typeof v !== "string" || v.length === 0) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

const toBase64Url = (bytes) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const fnv1a32 = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
};

const sha256Base64Url = async (text) => {
  try {
    if (!globalThis.crypto?.subtle) throw new Error("no crypto.subtle");
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return toBase64Url(new Uint8Array(digest));
  } catch {
    // Fallback: non-cryptographic hash, still deterministic.
    return fnv1a32(text).toString(16).padStart(8, "0");
  }
};

const keyForPageUrl = async (pageUrl) => {
  const h = await sha256Base64Url(pageUrl);
  return `${NEW_PREFIX}${h}`;
};

export const createExtrasCache = () => {
  const loadForPageUrl = async (pageUrl) => {
    if (!isHttpUrl(pageUrl)) return [];

    const key = await keyForPageUrl(pageUrl);

    // Fast path: new per-page key.
    try {
      const result = await chrome.storage.local.get(key);
      const cached = normalizeExtras(result?.[key]);
      if (cached.length > 0) return cached;
    } catch {
      // ignore
    }

    // Migration path: old monolithic map.
    try {
      const result = await chrome.storage.local.get(OLD_STORAGE_KEY);
      const map = result?.[OLD_STORAGE_KEY];
      if (!map || typeof map !== "object") return [];

      const migrated = normalizeExtras(map?.[pageUrl]);
      if (migrated.length === 0) return [];

      // Write into new key.
      await chrome.storage.local.set({ [key]: migrated });

      // Remove just this page from the old map.
      try {
        delete map[pageUrl];
        if (Object.keys(map).length === 0) {
          await chrome.storage.local.remove(OLD_STORAGE_KEY);
        } else {
          await chrome.storage.local.set({ [OLD_STORAGE_KEY]: map });
        }
      } catch {
        // ignore
      }

      return migrated;
    } catch {
      return [];
    }
  };

  const saveForPageUrl = async (pageUrl, extras) => {
    if (!isHttpUrl(pageUrl)) return false;

    const key = await keyForPageUrl(pageUrl);
    const normalized = normalizeExtras(extras);

    try {
      if (normalized.length === 0) {
        await chrome.storage.local.remove(key);
      } else {
        await chrome.storage.local.set({ [key]: normalized });
      }
      return true;
    } catch {
      return false;
    }
  };

  return {
    loadForPageUrl,
    saveForPageUrl,
  };
};
