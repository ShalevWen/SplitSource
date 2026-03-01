import { detectLanguage } from "/speed-highlight/dist/detect.js";
import { highlightText } from "/speed-highlight/dist/index.js";

(() => {
  "use strict";

  const elRoot = document.getElementById("root");
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

  const resetRootForRender = (mode) => {
    cancelPendingHighlight();
    stripSpeedHighlightClasses();
    elRoot.classList.toggle("imageView", mode === "image");
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
        return;
      }

      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";

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

    async source(url, opts = {}) {
      resetRootForRender("source");

      if (!url) {
        elRoot.textContent = "No active tab URL.";
        return;
      }

      if (!isHttpUrl(url)) {
        elRoot.textContent = `Unsupported URL: ${url}`;
        return;
      }

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

  const displayNameFromUrl = (urlString) => {
    if (typeof urlString !== "string") return String(urlString);
    try {
      const url = new URL(urlString);
      const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
      return lastSegment ? decodeURIComponent(lastSegment) : url.hostname;
    } catch {
      const last = urlString.split("/").filter(Boolean).at(-1);
      return last ?? urlString;
    }
  };

  const populateSubmenu = (kind, urls) => {
    const group = groups[kind];
    const container = group?.submenu;
    if (!container) return 0;

    container.replaceChildren();

    if (!Array.isArray(urls) || urls.length === 0) return 0;

    const fragment = document.createDocumentFragment();
    const seen = new Set();
    let count = 0;

    for (const url of urls) {
      if (typeof url !== "string" || url.length === 0) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      count++;

      const item = document.createElement("button");
      item.type = "button";
      item.className = "submenuItem";
      item.setAttribute("role", "menuitem");
      item.dataset.kind = kind;
      item.dataset.url = url;
      item.title = url;
      item.textContent = displayNameFromUrl(url);
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
