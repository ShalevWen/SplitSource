import { inferLanguageFromUrl } from "./utils.js";

export const createModeBar = ({ modeBar, state, render }) => {
  const setActiveMode = (mode) => {
    if (!modeBar) return;

    for (const btn of modeBar.querySelectorAll("button[data-mode]")) {
      const isActive = btn.dataset.mode === mode;
      btn.classList.toggle("isActive", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
  };

  const init = () => {
    if (!modeBar) return;

    modeBar.addEventListener("click", (e) => {
      const btn = e.target?.closest?.("button[data-mode]");
      const mode = btn?.dataset?.mode;
      if (!btn || !mode) return;

      if (!render) return;

      const url = state.currentUrl || state.pageUrl;
      if (!url) return;

      if (mode === "source") {
        void render.source(url, { languageHint: inferLanguageFromUrl(url) });
        return;
      }

      if (mode === "image") {
        render.image(url);
        return;
      }

      if (mode === "audio") {
        render.audio(url, null);
      }
    });

    // Show immediately; it will no-op until a URL exists.
    modeBar.hidden = false;

    if (state.currentViewMode) setActiveMode(state.currentViewMode);
  };

  return {
    init,
    setActiveMode,
  };
};
