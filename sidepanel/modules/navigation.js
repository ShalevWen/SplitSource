import {
  canPlayAudioMime,
  classifyMimeType,
  getFilenameFromPathname,
  inferAudioMimeFromUrl,
  inferLanguageFromContentType,
  inferLanguageFromUrl,
  isHttpUrl,
} from "./utils.js";

export const createNavigator = ({ state, render }) => {
  // In-memory cache for HEAD probe results to speed up repeated swaps.
  const HEAD_CACHE_MAX_ENTRIES = 50;
  const HEAD_CACHE_TTL_MS = 60_000;
  const headCache = new Map();

  const headCacheGet = (url) => {
    const hit = headCache.get(url);
    if (!hit) return null;
    if (Date.now() - (hit.ts || 0) > HEAD_CACHE_TTL_MS) {
      headCache.delete(url);
      return null;
    }
    headCache.delete(url);
    headCache.set(url, hit);
    return hit;
  };

  const headCacheSet = (url, value) => {
    if (!url || !value) return;
    headCache.delete(url);
    headCache.set(url, { ...value, ts: Date.now() });
    while (headCache.size > HEAD_CACHE_MAX_ENTRIES) {
      const oldestKey = headCache.keys().next().value;
      if (oldestKey == null) break;
      headCache.delete(oldestKey);
    }
  };

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "download";
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const downloadUrl = async (url) => {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return false;
      const blob = await res.blob();
      downloadBlob(blob, getFilenameFromPathname(new URL(url).pathname));
      return true;
    } catch {
      return false;
    }
  };

  const getPageOrigin = () => {
    try {
      return state.pageUrl ? new URL(state.pageUrl).origin : null;
    } catch {
      return null;
    }
  };

  const probeAndNavigate = async (nextUrlString, opts = {}) => {
    const onNotFound =
      typeof opts?.onNotFound === "function" ? opts.onNotFound : null;

    if (!isHttpUrl(nextUrlString)) {
      await render.source(nextUrlString, opts);
      return { outcome: "source" };
    }

    let nextUrl;
    try {
      nextUrl = new URL(nextUrlString);
    } catch {
      await render.source(nextUrlString, opts);
      return { outcome: "source" };
    }

    const pageOrigin = getPageOrigin();
    if (pageOrigin && nextUrl.origin !== pageOrigin) {
      return { outcome: "blocked" };
    }

    let contentType = "";
    const cachedHead = headCacheGet(nextUrl.toString());
    if (cachedHead) {
      if (cachedHead.status === 404) {
        onNotFound?.(nextUrl.toString());
        return { outcome: "notfound", status: 404, cached: true };
      }
      contentType = cachedHead.contentType || "";
    }

    try {
      if (!cachedHead) {
        const head = await fetch(nextUrl.toString(), {
          method: "HEAD",
          credentials: "include",
        });

        headCacheSet(nextUrl.toString(), {
          status: head.status,
          contentType: head.headers.get("content-type") || "",
        });

        if (head.status === 404) {
          onNotFound?.(nextUrl.toString());
          return { outcome: "notfound", status: 404 };
        }

        contentType = head.headers.get("content-type") || "";
      }
    } catch {
      // ignore
    }

    const classified = classifyMimeType(contentType);

    if (classified.kind === "image") {
      render.image(nextUrl.toString());
      return { outcome: "image" };
    }

    if (classified.kind === "audio") {
      if (!canPlayAudioMime(classified.mime)) {
        const ok = await downloadUrl(nextUrl.toString());
        return { outcome: ok ? "download" : "error" };
      }

      render.audio(nextUrl.toString(), classified.mime);
      return { outcome: "audio" };
    }

    if (classified.kind === "unknown") {
      const inferredAudioMime = inferAudioMimeFromUrl(nextUrl.toString());
      if (inferredAudioMime) {
        if (!canPlayAudioMime(inferredAudioMime)) {
          const ok = await downloadUrl(nextUrl.toString());
          return { outcome: ok ? "download" : "error" };
        }

        render.audio(nextUrl.toString(), inferredAudioMime);
        return { outcome: "audio" };
      }
    }

    if (classified.kind === "download") {
      const inferredAudioMime = inferAudioMimeFromUrl(nextUrl.toString());
      if (inferredAudioMime && canPlayAudioMime(inferredAudioMime)) {
        render.audio(nextUrl.toString(), inferredAudioMime);
        return { outcome: "audio" };
      }
    }

    if (classified.kind === "text" || classified.kind === "unknown") {
      const result = await render.source(nextUrl.toString(), {
        ...opts,
        languageHint:
          opts?.languageHint ||
          inferLanguageFromContentType(contentType) ||
          inferLanguageFromUrl(nextUrl.toString()),
      });

      if (result?.status === 404 && result?.committed === false) {
        onNotFound?.(nextUrl.toString());
        return { outcome: "notfound", status: 404 };
      }

      return {
        outcome: "source",
        ok: typeof result?.ok === "boolean" ? result.ok : null,
        status: result?.status ?? null,
      };
    }

    const ok = await downloadUrl(nextUrl.toString());
    return { outcome: ok ? "download" : "error" };
  };

  return {
    probeAndNavigate,
  };
};
