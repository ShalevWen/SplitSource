import { detectLanguage } from "/speed-highlight/dist/detect.js";
import { highlightText } from "/speed-highlight/dist/index.js";

export const createHighlighter = ({ root }) => {
  let highlightToken = 0;
  let highlightHandle = null;
  let highlightHandleKind = null;

  const cancelPendingHighlight = () => {
    highlightToken++;

    if (highlightHandle == null) return;

    if (
      highlightHandleKind === "idle" &&
      typeof cancelIdleCallback === "function"
    ) {
      cancelIdleCallback(highlightHandle);
    }

    if (highlightHandleKind === "timeout") {
      clearTimeout(highlightHandle);
    }

    highlightHandle = null;
    highlightHandleKind = null;
  };

  const stripSpeedHighlightClasses = () => {
    root.removeAttribute("data-lang");
    for (const cls of Array.from(root.classList)) {
      if (cls.startsWith("shj-")) root.classList.remove(cls);
    }
  };

  const scheduleHighlight = (text, lang) => {
    if (typeof text !== "string" || text.length === 0) return;

    const MAX_HIGHLIGHT_CHARS = 220_000;
    if (text.length > MAX_HIGHLIGHT_CHARS) return;

    const token = highlightToken;

    requestAnimationFrame(() => {
      const run = async () => {
        highlightHandle = null;
        highlightHandleKind = null;
        if (token !== highlightToken) return;

        const language = lang || detectLanguage(text) || "plain";

        try {
          const html = await highlightText(text, language, true);
          if (token !== highlightToken) return;

          stripSpeedHighlightClasses();
          root.dataset.lang = language;
          root.classList.add(`shj-lang-${language}`, "shj-multiline");
          root.innerHTML = html;
        } catch {
          // Keep plain text on failure.
        }
      };

      if (typeof requestIdleCallback === "function") {
        highlightHandleKind = "idle";
        highlightHandle = requestIdleCallback(() => void run());
      } else {
        highlightHandleKind = "timeout";
        highlightHandle = setTimeout(() => void run(), 0);
      }
    });
  };

  return {
    cancelPendingHighlight,
    stripSpeedHighlightClasses,
    scheduleHighlight,
  };
};
