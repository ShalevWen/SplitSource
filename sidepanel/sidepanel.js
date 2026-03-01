import { detectLanguage } from "/speed-highlight/dist/detect.js";
import { highlightText } from "/speed-highlight/dist/index.js";

(() => {
  "use strict";

  const elRoot = document.getElementById("root");
  const elFileBar = document.getElementById("fileBar");
  const elFileNameInput = document.getElementById("fileNameInput");
  const elMenuContainer = document.getElementById("menuContainer");
  const elBurgerButton = document.getElementById("burger");
  const elBurgerMenu = document.getElementById("burgerMenu");

  if (!elRoot || !elMenuContainer || !elBurgerButton || !elBurgerMenu) {
    if (elRoot) elRoot.textContent = "Sidepanel UI failed to initialize.";
    return;
  }

  const groups = {
    scripts: {
      group: elBurgerMenu.querySelector('.menuGroup[data-group="scripts"]'),
      toggle: elBurgerMenu.querySelector(
        '.menuGroup[data-group="scripts"] button[data-toggle]',
      ),
      submenu: document.getElementById("menu-scripts"),
    },
    stylesheets: {
      group: elBurgerMenu.querySelector('.menuGroup[data-group="stylesheets"]'),
      toggle: elBurgerMenu.querySelector(
        '.menuGroup[data-group="stylesheets"] button[data-toggle]',
      ),
      submenu: document.getElementById("menu-stylesheets"),
    },
    images: {
      group: elBurgerMenu.querySelector('.menuGroup[data-group="images"]'),
      toggle: elBurgerMenu.querySelector(
        '.menuGroup[data-group="images"] button[data-toggle]',
      ),
      submenu: document.getElementById("menu-images"),
    },
  };

  const state = {
    tab: null,
    pageUrl: null,
    fetchController: null,
    highlightToken: 0,
    highlightHandle: null,
    highlightHandleKind: null,
    currentUrl: null,
    currentViewMode: null,
    fileSwapContext: null,
  };

  const isHttpUrl = (url) => typeof url === "string" && /^https?:/i.test(url);

  const cancelPendingHighlight = () => {
    state.highlightToken++;

    if (state.highlightHandle == null) return;

    if (
      state.highlightHandleKind === "idle" &&
      typeof cancelIdleCallback === "function"
    ) {
      cancelIdleCallback(state.highlightHandle);
    }

    if (state.highlightHandleKind === "timeout") {
      clearTimeout(state.highlightHandle);
    }

    state.highlightHandle = null;
    state.highlightHandleKind = null;
  };

  const stripSpeedHighlightClasses = () => {
    elRoot.removeAttribute("data-lang");
    for (const cls of Array.from(elRoot.classList)) {
      if (cls.startsWith("shj-")) elRoot.classList.remove(cls);
    }
  };

  const getFileSwapContext = (urlString) => {
    if (typeof urlString !== "string") return null;
    if (!/^https?:/i.test(urlString)) return null;
    if (urlString.startsWith("data:") || urlString.startsWith("blob:"))
      return null;

    try {
      const url = new URL(urlString);
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments.at(-1);
      if (!last) return null;

      const filename = decodeURIComponent(last);

      // "Normal" filename heuristic: reasonably short + has an extension + not a
      // key=value style segment.
      const isNormal =
        filename.length <= 80 &&
        !filename.includes("=") &&
        /\.[a-z0-9]{1,6}$/i.test(filename) &&
        !/[\\/]/.test(filename);

      if (!isNormal) return null;

      return {
        url,
        segments,
        filename,
        relativePath: `${url.pathname}${url.search}`,
      };
    } catch {
      return null;
    }
  };

  const setFileBar = (ctx) => {
    if (!elFileBar || !elFileNameInput) return;

    state.fileSwapContext = ctx;

    if (!ctx) {
      elFileBar.hidden = true;
      elFileNameInput.value = "";
      elFileNameInput.disabled = true;
      elFileNameInput.removeAttribute("title");
      return;
    }

    elFileBar.hidden = false;
    elFileNameInput.disabled = false;
    elFileNameInput.value = ctx.relativePath;
    elFileNameInput.title = ctx.url.toString();
  };

  const resetRootForRender = (mode) => {
    cancelPendingHighlight();
    stripSpeedHighlightClasses();
    elRoot.classList.toggle("imageView", mode === "image");
    elRoot.classList.toggle("audioView", mode === "audio");

    state.currentViewMode = mode;
  };

  const inferLanguageFromUrl = (urlString) => {
    if (typeof urlString !== "string") return null;

    try {
      const url = new URL(urlString);
      const path = url.pathname.toLowerCase();
      const ext = path.includes(".") ? path.split(".").pop() : "";

      switch (ext) {
        case "js":
        case "mjs":
        case "cjs":
          return "js";
        case "ts":
        case "mts":
        case "cts":
          return "ts";
        case "css":
          return "css";
        case "json":
          return "json";
        case "html":
        case "htm":
          return "html";
        case "xml":
        case "svg":
          return "xml";
        case "yml":
        case "yaml":
          return "yaml";
        case "md":
          return "md";
        default:
          return null;
      }
    } catch {
      return null;
    }
  };

  const inferLanguageFromContentType = (contentType) => {
    if (typeof contentType !== "string") return null;
    const ct = contentType.toLowerCase();

    if (ct.includes("text/html") || ct.includes("application/xhtml"))
      return "html";
    if (ct.includes("text/css")) return "css";
    if (ct.includes("json")) return "json";
    if (ct.includes("javascript") || ct.includes("ecmascript")) return "js";
    if (ct.includes("xml")) return "xml";
    if (ct.includes("yaml")) return "yaml";

    return null;
  };

  const getFilenameFromPathname = (pathname) => {
    if (typeof pathname !== "string") return "download";
    const last = pathname.split("/").filter(Boolean).at(-1);
    return last ? decodeURIComponent(last) : "download";
  };

  const classifyMimeType = (contentType) => {
    if (typeof contentType !== "string" || contentType.length === 0)
      return { kind: "unknown", mime: "" };
    const mime = contentType.split(";", 1)[0].trim().toLowerCase();
    if (mime.startsWith("image/")) return { kind: "image", mime };
    if (mime.startsWith("audio/")) return { kind: "audio", mime };
    if (mime.startsWith("text/")) return { kind: "text", mime };

    if (
      mime.includes("json") ||
      mime.includes("javascript") ||
      mime.includes("ecmascript") ||
      mime.includes("xml") ||
      mime.includes("yaml")
    ) {
      return { kind: "text", mime };
    }

    // Treat everything else as a download (fonts, binaries, etc.).
    return { kind: "download", mime };
  };

  const inferAudioMimeFromUrl = (urlString) => {
    if (typeof urlString !== "string") return "";
    try {
      const url = new URL(urlString);
      const path = url.pathname.toLowerCase();
      const ext = path.includes(".") ? path.split(".").pop() : "";

      switch (ext) {
        case "mp3":
          return "audio/mpeg";
        case "m4a":
          return "audio/mp4";
        case "aac":
          return "audio/aac";
        case "wav":
          return "audio/wav";
        case "oga":
        case "ogg":
          return "audio/ogg";
        case "opus":
          return "audio/opus";
        case "flac":
          return "audio/flac";
        case "weba":
          return "audio/webm";
        default:
          return "";
      }
    } catch {
      return "";
    }
  };

  const canPlayAudioMime = (mime) => {
    if (typeof mime !== "string" || mime.length === 0) return true;
    try {
      const el = document.createElement("audio");
      const verdict = el.canPlayType(mime);
      return verdict === "probably" || verdict === "maybe";
    } catch {
      return true;
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

  const probeAndNavigate = async (nextUrlString, opts = {}) => {
    if (!isHttpUrl(nextUrlString)) {
      // Falls back to the existing behavior.
      await render.source(nextUrlString, opts);
      return;
    }

    let nextUrl;
    try {
      nextUrl = new URL(nextUrlString);
    } catch {
      await render.source(nextUrlString, opts);
      return;
    }

    // Enforce same-origin navigation.
    // (Menus are already same-origin filtered, but user input can be anything.)
    const pageOrigin = (() => {
      try {
        return state.pageUrl ? new URL(state.pageUrl).origin : null;
      } catch {
        return null;
      }
    })();

    if (pageOrigin && nextUrl.origin !== pageOrigin) return;

    // Probe type cheaply via HEAD first.
    let contentType = "";
    try {
      const head = await fetch(nextUrl.toString(), {
        method: "HEAD",
        credentials: "include",
      });
      contentType = head.headers.get("content-type") || "";
    } catch {
      // ignore
    }

    // If server doesn't support HEAD / doesn't return content-type, fallback to ext.
    const classified = classifyMimeType(contentType);
    if (classified.kind === "image") {
      render.image(nextUrl.toString());
      return;
    }

    if (classified.kind === "audio") {
      if (!canPlayAudioMime(classified.mime)) {
        await downloadUrl(nextUrl.toString());
        return;
      }
      render.audio(nextUrl.toString(), classified.mime);
      return;
    }

    if (classified.kind === "unknown") {
      const inferredAudioMime = inferAudioMimeFromUrl(nextUrl.toString());
      if (inferredAudioMime) {
        if (!canPlayAudioMime(inferredAudioMime)) {
          await downloadUrl(nextUrl.toString());
          return;
        }
        render.audio(nextUrl.toString(), inferredAudioMime);
        return;
      }
    }

    if (classified.kind === "download") {
      const inferredAudioMime = inferAudioMimeFromUrl(nextUrl.toString());
      if (inferredAudioMime && canPlayAudioMime(inferredAudioMime)) {
        render.audio(nextUrl.toString(), inferredAudioMime);
        return;
      }
    }

    if (classified.kind === "text" || classified.kind === "unknown") {
      // For unknown, still try source rendering (safe + consistent).
      await render.source(nextUrl.toString(), {
        ...opts,
        languageHint:
          opts?.languageHint ||
          inferLanguageFromContentType(contentType) ||
          inferLanguageFromUrl(nextUrl.toString()),
      });
      return;
    }

    // Download case: keep the previous view intact.
    await downloadUrl(nextUrl.toString());
  };

  const scheduleHighlight = (text, lang) => {
    if (typeof text !== "string" || text.length === 0) return;

    // Speed Highlight is async, but highlighting very large payloads can still
    // be expensive. Skip to keep the panel responsive.
    const MAX_HIGHLIGHT_CHARS = 220_000;
    if (text.length > MAX_HIGHLIGHT_CHARS) return;

    const token = state.highlightToken;

    requestAnimationFrame(() => {
      const run = async () => {
        state.highlightHandle = null;
        state.highlightHandleKind = null;
        if (token !== state.highlightToken) return;

        const language = lang || detectLanguage(text) || "plain";

        try {
          const html = await highlightText(text, language, true);
          if (token !== state.highlightToken) return;

          // Preserve non-speed-highlight classes (e.g. imageView) while ensuring
          // we don't accumulate shj-* classes across renders.
          stripSpeedHighlightClasses();
          elRoot.dataset.lang = language;
          elRoot.classList.add(`shj-lang-${language}`, "shj-multiline");
          elRoot.innerHTML = html;
        } catch {
          // If highlighting fails, keep plain text.
        }
      };

      if (typeof requestIdleCallback === "function") {
        state.highlightHandleKind = "idle";
        state.highlightHandle = requestIdleCallback(() => void run());
      } else {
        state.highlightHandleKind = "timeout";
        state.highlightHandle = setTimeout(() => void run(), 0);
      }
    });
  };

  const render = {
    image(url) {
      resetRootForRender("image");

      if (!url) {
        elRoot.textContent = "No image URL.";
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
          // Keep the URL accessible via the file bar tooltip.
          elRoot.textContent = `Failed to load image.`;
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

      elRoot.replaceChildren(img);

      if (img.complete) {
        img.classList.add("isLoaded");
      }
    },

    audio(url, mime) {
      resetRootForRender("audio");

      if (!url) {
        elRoot.textContent = "No audio URL.";
        setFileBar(null);
        return;
      }

      if (!isHttpUrl(url)) {
        elRoot.textContent = `Unsupported URL: ${url}`;
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
          elRoot.textContent = "Failed to load audio.";
          setFileBar(getFileSwapContext(url));
        },
        { once: true },
      );

      elRoot.replaceChildren(elAudio);
    },

    async source(url, opts = {}) {
      resetRootForRender("source");

      if (!url) {
        elRoot.textContent = "No active tab URL.";
        return;
      }

      if (!isHttpUrl(url)) {
        elRoot.textContent = `Unsupported URL: ${url}`;
        setFileBar(null);
        return;
      }

      state.currentUrl = url;
      setFileBar(getFileSwapContext(url));

      // Abort any in-flight fetch to avoid wasted work.
      state.fetchController?.abort();
      const controller = new AbortController();
      state.fetchController = controller;

      elRoot.textContent = `view-source:${url}\n\nLoading…`;

      try {
        const res = await fetch(url, {
          credentials: "include",
          signal: controller.signal,
        });
        const text = await res.text();
        if (controller.signal.aborted) return;
        elRoot.textContent = text;

        const languageHint =
          typeof opts?.languageHint === "string" ? opts.languageHint : null;
        const contentType = res.headers.get("content-type");
        const lang =
          languageHint ||
          inferLanguageFromContentType(contentType) ||
          inferLanguageFromUrl(url) ||
          null;
        scheduleHighlight(text, lang);
      } catch (err) {
        if (controller.signal.aborted) return;
        elRoot.textContent = `Failed to load source: ${err?.message ?? String(err)}`;
      } finally {
        if (state.fetchController === controller) state.fetchController = null;
      }
    },
  };

  if (elFileBar && elFileNameInput) {
    elFileNameInput.placeholder = "/path/to/file.ext";

    elFileBar.addEventListener("submit", (e) => {
      e.preventDefault();

      const ctx = state.fileSwapContext;
      if (!ctx || !state.currentUrl) return;

      let nextName = elFileNameInput.value.trim();
      if (!nextName) return;

      // Normalize Windows-style paths (user paste) into URL paths.
      nextName = nextName.replaceAll("\\\\", "/");

      // Input is intended to be origin-relative ("/path/file.ext").
      // Reject obvious full URLs/schemes.
      if (/^[a-z][a-z0-9+.-]*:/i.test(nextName)) return;

      // Input shows an origin-relative URL path (e.g. "/static/app.js").
      // Allow either "/..." or "..." and normalize.
      const nextPath = nextName.startsWith("/") ? nextName : `/${nextName}`;

      let nextUrl;
      try {
        nextUrl = new URL(nextPath, ctx.url.origin);
      } catch {
        return;
      }

      // Enforce same-origin navigation.
      if (nextUrl.origin !== ctx.url.origin) return;

      // Manual navigation should clear the menu highlight to avoid implying
      // you're still viewing the exact selected resource.
      setActiveMenuEl(null);

      const prevCtx = state.fileSwapContext;
      const prevMode = state.currentViewMode;
      const prevUrl = state.currentUrl;

      const nextUrlString = nextUrl.toString();

      void (async () => {
        await probeAndNavigate(nextUrlString, {
          languageHint: inferLanguageFromUrl(nextUrlString),
        });

        // If we downloaded instead of navigating, restore UI state.
        if (
          state.currentUrl === prevUrl &&
          state.currentViewMode === prevMode
        ) {
          setFileBar(prevCtx);
        }
      })();
    });
  }

  const setActiveMenuEl = (el) => {
    for (const prev of elBurgerMenu.querySelectorAll(".isActive")) {
      prev.classList.remove("isActive");
    }
    if (el) el.classList.add("isActive");
  };

  const menu = {
    setOpen(open) {
      if (!open) {
        const active = document.activeElement;
        if (active && elBurgerMenu.contains(active)) {
          elBurgerButton.focus({ preventScroll: true });
        }
      }

      elMenuContainer.classList.toggle("open", open);
      elBurgerButton.setAttribute("aria-expanded", open ? "true" : "false");
      elBurgerMenu.setAttribute("aria-hidden", open ? "false" : "true");
      elBurgerMenu.toggleAttribute("inert", !open);
    },

    isOpen() {
      return elMenuContainer.classList.contains("open");
    },

    show() {
      elMenuContainer.classList.add("ready");
    },
  };

  const closeGroup = (group) => {
    if (!group?.group) return;
    group.group.classList.remove("open");
    if (group.toggle) group.toggle.setAttribute("aria-expanded", "false");
    if (group.submenu) group.submenu.setAttribute("aria-hidden", "true");
  };

  const openGroupExclusive = (kind, focusTarget) => {
    const active = document.activeElement;
    for (const [otherKind, group] of Object.entries(groups)) {
      if (otherKind === kind) continue;
      if (active && group?.group && group.group.contains(active)) {
        focusTarget?.focus?.({ preventScroll: true });
      }
      closeGroup(group);
    }

    const group = groups[kind];
    if (!group?.group || !group.toggle || !group.submenu) return;

    const nextOpen = !group.group.classList.contains("open");
    group.group.classList.toggle("open", nextOpen);
    group.toggle.setAttribute("aria-expanded", nextOpen ? "true" : "false");
    group.submenu.setAttribute("aria-hidden", nextOpen ? "false" : "true");
  };

  const setGroupVisible = (kind, visible) => {
    const group = groups[kind];
    if (!group?.group) return;

    group.group.hidden = !visible;
    if (!visible) {
      const active = document.activeElement;
      if (active && group.group.contains(active)) {
        elBurgerButton.focus({ preventScroll: true });
      }
      closeGroup(group);
    }
  };

  const displayNameFromUrl = (urlString, indexHint) => {
    if (typeof urlString !== "string") return String(urlString);

    const shortenMiddle = (s, maxLen = 56) => {
      if (typeof s !== "string") return String(s);
      if (s.length <= maxLen) return s;
      const head = Math.max(18, Math.floor((maxLen - 1) * 0.6));
      const tail = Math.max(10, maxLen - 1 - head);
      return `${s.slice(0, head)}…${s.slice(-tail)}`;
    };

    if (urlString.startsWith("data:")) {
      // Avoid showing the base64 payload in the menu.
      // Example: data:image/png;base64,....
      const mime = urlString.slice(5).split(/[;,]/, 1)[0] || "";
      const n = Number.isFinite(indexHint) ? ` #${indexHint + 1}` : "";

      if (mime.startsWith("image/")) {
        const subtype = mime.slice("image/".length) || "image";
        return `Inline image (${subtype})${n}`;
      }

      return `Inline data${mime ? ` (${mime})` : ""}${n}`;
    }

    if (urlString.startsWith("blob:")) {
      const n = Number.isFinite(indexHint) ? ` #${indexHint + 1}` : "";
      return `Blob URL${n}`;
    }

    try {
      const url = new URL(urlString);

      // Prefer an origin-relative path for same-origin resources.
      // This keeps labels consistent and yields a valid src-like value.
      if (state.pageUrl) {
        try {
          const page = new URL(state.pageUrl);
          if (url.origin === page.origin) {
            return `${url.pathname}${url.search}`;
          }
        } catch {
          // fall through
        }
      }

      const segments = url.pathname.split("/").filter(Boolean);
      const lastSegment = segments.at(-1) ?? "";

      // Some CDNs / apps (notably Google) embed useful identifiers as
      // `k=...` / `m=...` / `v=...` path segments, and can include gigantic
      // segments that are unreadable in a menu.
      const kSegment = segments.find((s) => s.startsWith("k="));
      const mSegment = segments.find((s) => s.startsWith("m="));
      const vSegment = segments.find((s) => s.startsWith("v="));

      let candidate = kSegment ?? mSegment ?? vSegment ?? lastSegment;
      candidate = candidate ? decodeURIComponent(candidate) : "";

      if (!candidate) return url.hostname;

      const xjs = url.searchParams.get("xjs");
      const suffix = xjs ? ` (xjs=${shortenMiddle(xjs, 18)})` : "";

      // If it's a normal-looking filename, keep it simple.
      const looksLikeFilename =
        candidate.length <= 60 && /\.[a-z0-9]{1,6}$/i.test(candidate);
      if (looksLikeFilename) return candidate;

      // If it's long / token-y, prefix hostname and shorten.
      const label = `${url.hostname} ${shortenMiddle(candidate, 56)}`;
      return `${label}${suffix}`;
    } catch {
      const last = urlString.split("/").filter(Boolean).at(-1);
      return shortenMiddle(last ?? urlString, 56);
    }
  };

  const populateSubmenu = (kind, urls) => {
    const group = groups[kind];
    const container = group?.submenu;
    if (!container) return 0;

    container.replaceChildren();

    if (!Array.isArray(urls) || urls.length === 0) return 0;

    const fragment = document.createDocumentFragment();
    let count = 0;

    for (const [i, url] of urls.entries()) {
      if (typeof url !== "string" || url.length === 0) continue;
      count++;

      const item = document.createElement("button");
      item.type = "button";
      item.className = "submenuItem";
      item.setAttribute("role", "menuitem");
      item.dataset.kind = kind;
      item.dataset.url = url;
      item.title = url;
      item.textContent = displayNameFromUrl(url, i);
      fragment.appendChild(item);
    }

    container.appendChild(fragment);
    return count;
  };

  // Initial menu state: hidden until data arrives.
  elMenuContainer.classList.remove("ready");
  elBurgerMenu.toggleAttribute("inert", true);

  elBurgerButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    menu.setOpen(!menu.isOpen());
  });

  elBurgerMenu.addEventListener("click", (e) => {
    const actionButton = e.target?.closest?.("button[data-action]");
    const action = actionButton?.dataset?.action;
    if (action === "page") {
      setActiveMenuEl(actionButton);
      void render.source(state.pageUrl, { languageHint: "html" });
      menu.setOpen(false);
      return;
    }

    const toggleButton = e.target?.closest?.("button[data-toggle]");
    const toggleKind = toggleButton?.dataset?.toggle;
    if (toggleKind && toggleKind in groups) {
      openGroupExclusive(toggleKind, toggleButton);
      return;
    }

    const itemButton = e.target?.closest?.("button.submenuItem[data-url]");
    const url = itemButton?.dataset?.url;
    const kind = itemButton?.dataset?.kind;
    if (!url || !kind) return;

    if (kind === "scripts" || kind === "stylesheets") {
      setActiveMenuEl(itemButton);
      void render.source(url, {
        languageHint: kind === "stylesheets" ? "css" : "js",
      });
      menu.setOpen(false);
      return;
    }

    if (kind === "images") {
      setActiveMenuEl(itemButton);
      render.image(url);
      menu.setOpen(false);
    }
  });

  document.addEventListener("click", (e) => {
    if (!menu.isOpen()) return;
    if (elMenuContainer.contains(e.target)) return;
    menu.setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.isOpen()) {
      menu.setOpen(false);
    }
  });

  const init = async () => {
    const params = new URLSearchParams(globalThis.location?.search ?? "");
    const tabIdParam = params.get("tabId");
    const tabId = tabIdParam ? Number(tabIdParam) : null;

    if (tabId && Number.isFinite(tabId)) {
      state.tab = await chrome.tabs.get(tabId);
    } else {
      [state.tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
    }

    state.pageUrl = state.tab?.url ?? null;

    chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo) => {
      if (updatedTabId === state.tab?.id && changeInfo.url) {
        window.location.reload();
      }
    });

    await render.source(state.pageUrl, { languageHint: "html" });

    // Default highlight reflects the initial view.
    setActiveMenuEl(elBurgerMenu.querySelector('button[data-action="page"]'));

    chrome.runtime.onMessage.addListener((message, sender) => {
      if (message?.type !== "DOCUMENT_INFO") return;
      if (sender?.tab?.id && state.tab?.id && sender.tab.id !== state.tab.id)
        return;

      const docInfo = message.data;
      if (!docInfo) return;

      const scriptsCount = populateSubmenu("scripts", docInfo.scripts);
      const stylesheetsCount = populateSubmenu(
        "stylesheets",
        docInfo.styleSheets,
      );
      const imagesCount = populateSubmenu("images", docInfo.images);

      setGroupVisible("scripts", scriptsCount > 0);
      setGroupVisible("stylesheets", stylesheetsCount > 0);
      setGroupVisible("images", imagesCount > 0);

      menu.show();
    });

    // Kick off content-script collection.
    if (state.tab?.id) {
      await chrome.scripting.executeScript({
        target: { tabId: state.tab.id },
        files: ["content-script.js"],
      });
    }
  };

  void init();
})();
