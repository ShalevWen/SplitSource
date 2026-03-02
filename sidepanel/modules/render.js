import { getFileSwapContext, getPageSwapContext } from "./fileBar.js";
import {
  inferLanguageFromContentType,
  inferLanguageFromUrl,
  isHttpUrl,
} from "./utils.js";

export const createRenderer = ({ root, state, highlighter, setFileBar }) => {
  // In-memory cache for fetched source so swapping back/forth is instant.
  // Scoped to this sidepanel instance (per tab/page URL).
  const SOURCE_CACHE_MAX_ENTRIES = 25;
  const SOURCE_CACHE_MAX_CHARS = 1_000_000;
  const sourceCache = new Map();

  const sourceCacheGet = (url) => {
    const hit = sourceCache.get(url);
    if (!hit) return null;
    sourceCache.delete(url);
    sourceCache.set(url, hit);
    return hit;
  };

  const sourceCacheSet = (url, value) => {
    if (!url || !value) return;
    if (typeof value.text === "string" && value.text.length > SOURCE_CACHE_MAX_CHARS)
      return;

    sourceCache.delete(url);
    sourceCache.set(url, value);

    while (sourceCache.size > SOURCE_CACHE_MAX_ENTRIES) {
      const oldestKey = sourceCache.keys().next().value;
      if (oldestKey == null) break;
      sourceCache.delete(oldestKey);
    }
  };

  const setFileBarForUrl = (urlString) => {
    const ctx =
      getFileSwapContext(urlString) ||
      getPageSwapContext(urlString) ||
      getPageSwapContext(state.pageUrl);
    setFileBar(ctx);
  };

  const resetRootForRender = (mode) => {
    highlighter.cancelPendingHighlight();
    highlighter.stripSpeedHighlightClasses();

    root.classList.toggle("imageView", mode === "image");
    root.classList.toggle("audioView", mode === "audio");

    state.currentViewMode = mode;
  };

  const image = (url) => {
    resetRootForRender("image");

    if (!url) {
      root.textContent = "No image URL.";
      setFileBarForUrl(state.pageUrl);
      return;
    }

    state.currentUrl = url;
    setFileBarForUrl(url);

    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";

    img.addEventListener(
      "error",
      () => {
        root.textContent = "Failed to load image.";
        setFileBarForUrl(url);
      },
      { once: true },
    );

    img.addEventListener(
      "load",
      () => {
        img.classList.add("isLoaded");
      },
      { once: true },
    );

    root.replaceChildren(img);

    if (img.complete) {
      img.classList.add("isLoaded");
    }
  };

  const audio = (url, mime) => {
    resetRootForRender("audio");

    if (!url) {
      root.textContent = "No audio URL.";
      setFileBarForUrl(state.pageUrl);
      return;
    }

    if (!isHttpUrl(url)) {
      root.textContent = `Unsupported URL: ${url}`;
      setFileBarForUrl(state.pageUrl);
      return;
    }

    state.currentUrl = url;
    setFileBarForUrl(url);

    const elAudio = document.createElement("audio");
    elAudio.controls = true;
    elAudio.preload = "metadata";

    const source = document.createElement("source");
    source.src = url;
    if (typeof mime === "string" && mime.length > 0) source.type = mime;
    elAudio.appendChild(source);

    elAudio.addEventListener(
      "error",
      () => {
        root.textContent = "Failed to load audio.";
        setFileBarForUrl(url);
      },
      { once: true },
    );

    root.replaceChildren(elAudio);
  };

  const source = async (url, opts = {}) => {
    const preserveViewOn404 = opts?.preserveViewOn404 === true;

    if (!url) {
      resetRootForRender("source");
      root.textContent = "No active tab URL.";
      setFileBarForUrl(state.pageUrl);
      return { ok: false, committed: true, status: null };
    }

    if (!isHttpUrl(url)) {
      resetRootForRender("source");
      root.textContent = `Unsupported URL: ${url}`;
      setFileBarForUrl(state.pageUrl);
      return { ok: false, committed: true, status: null };
    }

    // Cache hit: render immediately without refetching.
    const cached = sourceCacheGet(url);
    if (cached && typeof cached.text === "string") {
      state.fetchController?.abort();
      state.fetchController = null;

      resetRootForRender("source");
      state.currentUrl = url;
      setFileBarForUrl(url);

      root.textContent = cached.text;

      const languageHint =
        typeof opts?.languageHint === "string" ? opts.languageHint : null;
      const lang =
        languageHint ||
        inferLanguageFromContentType(cached.contentType || "") ||
        inferLanguageFromUrl(url) ||
        null;

      highlighter.scheduleHighlight(cached.text, lang);
      return {
        ok: true,
        committed: true,
        status: typeof cached.status === "number" ? cached.status : 200,
        cached: true,
      };
    }

    state.fetchController?.abort();
    const controller = new AbortController();
    state.fetchController = controller;

    const commitUi = () => {
      resetRootForRender("source");
      state.currentUrl = url;
      setFileBarForUrl(url);
    };

    if (!preserveViewOn404) {
      commitUi();
      root.textContent = `view-source:${url}\n\nLoading…`;
    }

    try {
      const res = await fetch(url, {
        credentials: "include",
        signal: controller.signal,
      });

      if (controller.signal.aborted) {
        return { ok: false, committed: false, aborted: true, status: null };
      }

      if (!res.ok) {
        if (preserveViewOn404 && res.status === 404) {
          return { ok: false, committed: false, status: 404 };
        }

        if (preserveViewOn404) {
          commitUi();
        }

        root.textContent = `Failed to load source (${res.status}${res.statusText ? ` ${res.statusText}` : ""}).`;
        return { ok: false, committed: true, status: res.status };
      }

      const text = await res.text();
      if (controller.signal.aborted) {
        return { ok: false, committed: false, aborted: true, status: null };
      }

      if (preserveViewOn404) {
        commitUi();
      }

      root.textContent = text;

      const languageHint =
        typeof opts?.languageHint === "string" ? opts.languageHint : null;
      const contentType = res.headers.get("content-type");
      const lang =
        languageHint ||
        inferLanguageFromContentType(contentType) ||
        inferLanguageFromUrl(url) ||
        null;

      highlighter.scheduleHighlight(text, lang);

      sourceCacheSet(url, {
        text,
        contentType: contentType || "",
        status: res.status,
      });
      return { ok: true, committed: true, status: res.status };
    } catch (err) {
      if (controller.signal.aborted) {
        return { ok: false, committed: false, aborted: true, status: null };
      }

      if (preserveViewOn404) {
        commitUi();
      }

      root.textContent = `Failed to load source: ${err?.message ?? String(err)}`;
      return { ok: false, committed: true, status: null };
    } finally {
      if (state.fetchController === controller) state.fetchController = null;
    }
  };

  return {
    resetRootForRender,
    image,
    audio,
    source,
  };
};
