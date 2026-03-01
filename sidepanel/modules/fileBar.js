export const getFileSwapContext = (urlString) => {
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

// Similar to getFileSwapContext(), but does not require a "normal" filename.
// Intended for Page view URLs like https://site/app (no extension) or https://site/.
export const getPageSwapContext = (urlString) => {
  if (typeof urlString !== "string") return null;
  if (!/^https?:/i.test(urlString)) return null;
  if (urlString.startsWith("data:") || urlString.startsWith("blob:"))
    return null;

  try {
    const url = new URL(urlString);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments.at(-1) ?? "";
    const filename = last ? decodeURIComponent(last) : "";

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

export const createFileBar = ({ fileBar, fileNameInput, state }) => {
  const setFileBar = (ctx) => {
    if (!fileBar || !fileNameInput) return;

    state.fileSwapContext = ctx;

    if (!ctx) {
      fileBar.hidden = true;
      fileNameInput.value = "";
      fileNameInput.disabled = true;
      fileNameInput.removeAttribute("title");
      return;
    }

    fileBar.hidden = false;
    fileNameInput.disabled = false;
    fileNameInput.value = ctx.relativePath;
    fileNameInput.title = ctx.url.toString();
  };

  const init = ({
    probeAndNavigate,
    setActiveMenuEl,
    inferLanguageFromUrl,
    onSubmittedUrl,
  }) => {
    if (!fileBar || !fileNameInput) return;

    fileNameInput.placeholder = "/path/to/file.ext";

    // Clear any previous validation message as the user edits.
    fileNameInput.addEventListener("input", () => {
      fileNameInput.setCustomValidity("");
    });

    fileBar.addEventListener("submit", (e) => {
      e.preventDefault();

      const ctx = state.fileSwapContext;
      if (!ctx || !state.currentUrl) return;

      let nextName = fileNameInput.value.trim();
      if (!nextName) return;

      nextName = nextName.replaceAll("\\\\", "/");

      if (/^[a-z][a-z0-9+.-]*:/i.test(nextName)) return;

      const nextPath = nextName.startsWith("/") ? nextName : `/${nextName}`;

      let nextUrl;
      try {
        nextUrl = new URL(nextPath, ctx.url.origin);
      } catch {
        return;
      }

      if (nextUrl.origin !== ctx.url.origin) return;

      const prevCtx = state.fileSwapContext;
      const prevMode = state.currentViewMode;
      const prevUrl = state.currentUrl;

      const nextUrlString = nextUrl.toString();

      void (async () => {
        fileNameInput.setCustomValidity("");

        const result = await probeAndNavigate(nextUrlString, {
          languageHint: inferLanguageFromUrl(nextUrlString),
          preserveViewOn404: true,
          onNotFound: () => {
            fileNameInput.setCustomValidity("Not found (404).");
            fileNameInput.reportValidity();
          },
        });

        if (result?.outcome === "notfound") {
          // Stay on current view; keep menu highlight.
          return;
        }

        if (result?.outcome === "blocked" || result?.outcome === "error") {
          return;
        }

        setActiveMenuEl(null);

        if (
          result?.outcome === "source" &&
          typeof result?.ok === "boolean" &&
          result.ok === false
        ) {
          return;
        }

        if (typeof onSubmittedUrl === "function") {
          onSubmittedUrl(nextUrlString);
        }

        // If the navigation resulted in a download (or otherwise didn't change the view),
        // restore the bar to the current view context.
        if (
          state.currentUrl === prevUrl &&
          state.currentViewMode === prevMode
        ) {
          setFileBar(prevCtx);
        }
      })();
    });
  };

  return {
    init,
    setFileBar,
  };
};
