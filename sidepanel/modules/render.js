import { getFileSwapContext, getPageSwapContext } from "./fileBar.js";
import {
  inferLanguageFromContentType,
  inferLanguageFromUrl,
  isHttpUrl,
} from "./utils.js";

export const createRenderer = ({ root, state, highlighter, setFileBar }) => {
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
      setFileBar(null);
      return;
    }

    state.currentUrl = url;
    setFileBar(getFileSwapContext(url));

    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";

    img.addEventListener(
      "error",
      () => {
        root.textContent = "Failed to load image.";
        setFileBar(getFileSwapContext(url));
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
      setFileBar(null);
      return;
    }

    if (!isHttpUrl(url)) {
      root.textContent = `Unsupported URL: ${url}`;
      setFileBar(null);
      return;
    }

    state.currentUrl = url;
    setFileBar(getFileSwapContext(url));

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
        setFileBar(getFileSwapContext(url));
      },
      { once: true },
    );

    root.replaceChildren(elAudio);
  };

  const source = async (url, opts = {}) => {
    resetRootForRender("source");

    if (!url) {
      root.textContent = "No active tab URL.";
      return;
    }

    if (!isHttpUrl(url)) {
      root.textContent = `Unsupported URL: ${url}`;
      setFileBar(null);
      return;
    }

    state.currentUrl = url;
    const swapCtx =
      getFileSwapContext(url) ||
      (url === state.pageUrl ? getPageSwapContext(url) : null);
    setFileBar(swapCtx);

    state.fetchController?.abort();
    const controller = new AbortController();
    state.fetchController = controller;

    root.textContent = `view-source:${url}\n\nLoading…`;

    try {
      const res = await fetch(url, {
        credentials: "include",
        signal: controller.signal,
      });
      const text = await res.text();
      if (controller.signal.aborted) return;

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
    } catch (err) {
      if (controller.signal.aborted) return;
      root.textContent = `Failed to load source: ${err?.message ?? String(err)}`;
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
