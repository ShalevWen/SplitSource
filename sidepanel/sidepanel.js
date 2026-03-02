import { getDom } from "./modules/dom.js";
import { createExtrasCache } from "./modules/extrasCache.js";
import { createFileBar } from "./modules/fileBar.js";
import { createHighlighter } from "./modules/highlight.js";
import { createMenu } from "./modules/menu.js";
import { createModeBar } from "./modules/modeBar.js";
import { createNavigator } from "./modules/navigation.js";
import { createRenderer } from "./modules/render.js";
import { createState } from "./modules/state.js";
import { inferLanguageFromUrl } from "./modules/utils.js";

(() => {
  "use strict";

  let dom;
  try {
    dom = getDom();
  } catch {
    const root = document.getElementById("root");
    if (root) root.textContent = "Sidepanel UI failed to initialize.";
    return;
  }

  const state = createState();
  const highlighter = createHighlighter({ root: dom.root });

  const fileBar = createFileBar({
    fileBar: dom.fileBar,
    fileNameInput: dom.fileNameInput,
    state,
  });

  let modeBar;

  const render = createRenderer({
    root: dom.root,
    state,
    highlighter,
    setFileBar: fileBar.setFileBar,
    onModeChange: (mode) => modeBar?.setActiveMode?.(mode),
  });

  modeBar = createModeBar({
    modeBar: dom.modeBar,
    state,
    render,
  });

  modeBar.init();

  const navigator = createNavigator({ state, render });

  const extrasCache = createExtrasCache();

  const menu = createMenu({
    menuContainer: dom.menuContainer,
    burgerButton: dom.burgerButton,
    burgerMenu: dom.burgerMenu,
    groups: dom.groups,
    state,
    render,
    probeAndNavigate: navigator.probeAndNavigate,
    inferLanguageFromUrl,
    extrasCache,
  });

  menu.init();

  fileBar.init({
    probeAndNavigate: navigator.probeAndNavigate,
    setActiveMenuEl: menu.setActiveMenuEl,
    inferLanguageFromUrl,
    onSubmittedUrl: menu.maybeAddExtraUrl,
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

    // Load cached Extras for the exact page URL (per-page isolation).
    state.extras = await extrasCache.loadForPageUrl(state.pageUrl);
    if (
      typeof state.pageUrl === "string" &&
      Array.isArray(state.extras) &&
      state.extras.includes(state.pageUrl)
    ) {
      state.extras = state.extras.filter((u) => u !== state.pageUrl);
      void extrasCache.saveForPageUrl(state.pageUrl, state.extras);
    }

    chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo) => {
      if (updatedTabId === state.tab?.id && changeInfo.url) {
        window.location.reload();
      }
    });

    await render.source(state.pageUrl, { languageHint: "html" });
    menu.setActiveMenuEl(
      dom.burgerMenu.querySelector('button[data-action="page"]'),
    );

    chrome.runtime.onMessage.addListener((message, sender) => {
      if (message?.type !== "DOCUMENT_INFO") return;
      if (sender?.tab?.id && state.tab?.id && sender.tab.id !== state.tab.id)
        return;

      const docInfo = message.data;
      if (!docInfo) return;

      menu.populateFromDocInfo(docInfo);
    });

    if (state.tab?.id) {
      await chrome.scripting.executeScript({
        target: { tabId: state.tab.id },
        files: ["content-script.js"],
      });
    }
  };

  void init();
})();
