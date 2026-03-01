(async () => {
  const root = document.getElementById("root");

  let currentPageUrl = null;

  const renderImageFromUrl = async (url) => {
    if (!root) return;

    root.classList.remove("prettyprinted");
    root.classList.add("imageView");

    if (!url) {
      root.textContent = "No image URL.";
      return;
    }

    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    img.loading = "lazy";

    root.replaceChildren(img);
  };

  const renderSourceFromUrl = async (url) => {
    if (!root) return;

    root.classList.remove("prettyprinted");
    root.classList.remove("imageView");

    if (!url) {
      root.textContent = "No active tab URL.";
      return;
    }

    if (!/^https?:/i.test(url)) {
      root.textContent = `Unsupported URL: ${url}`;
      return;
    }

    // Chrome does not allow embedding `view-source:` in an iframe in extension pages.
    // Instead, render the page source directly (equivalent to view-source for most uses).
    root.textContent = `view-source:${url}\n\nLoading…`;

    try {
      const res = await fetch(url, { credentials: "include" });
      const text = await res.text();
      root.textContent = text;
      window.PR?.prettyPrint?.();
    } catch (err) {
      root.textContent = `Failed to load source: ${err?.message ?? String(err)}`;
    }
  };

  const menuContainer = document.getElementById("menuContainer");
  const burgerButton = document.getElementById("burger");
  const burgerMenu = document.getElementById("burgerMenu");

  menuContainer?.classList.remove("ready");

  const moveFocusToBurgerIfNeeded = () => {
    if (!burgerButton || !burgerMenu) return;
    const active = document.activeElement;
    if (active && burgerMenu.contains(active)) {
      burgerButton.focus({ preventScroll: true });
    }
  };

  const setMenuOpen = (open) => {
    if (!menuContainer || !burgerButton || !burgerMenu) return;

    if (!open) {
      moveFocusToBurgerIfNeeded();
    }

    menuContainer.classList.toggle("open", open);
    burgerButton.setAttribute("aria-expanded", open ? "true" : "false");
    burgerMenu.setAttribute("aria-hidden", open ? "false" : "true");

    // Prevent focusing into hidden menu content (also avoids aria-hidden focus warnings).
    try {
      burgerMenu.toggleAttribute("inert", !open);
    } catch {
      // ignore if inert isn't supported
    }
  };

  const isMenuOpen = () => Boolean(menuContainer?.classList.contains("open"));

  if (burgerButton && menuContainer && burgerMenu) {
    // Ensure initial state is non-interactive until opened.
    try {
      burgerMenu.toggleAttribute("inert", true);
    } catch {
      // ignore
    }

    burgerButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(!isMenuOpen());
    });

    burgerMenu.addEventListener("click", (e) => {
      const button = e.target?.closest?.("button[data-action]");
      const action = button?.dataset?.action;
      if (action) {
        if (action === "page") {
          void renderSourceFromUrl(currentPageUrl);
          setMenuOpen(false);
        }
        return;
      }

      const toggleButton = e.target?.closest?.("button[data-toggle]");
      if (toggleButton) {
        const group = toggleButton.closest(".menuGroup");
        if (!group) return;

        const nextOpen = !group.classList.contains("open");

        if (nextOpen) {
          const openGroups = burgerMenu.querySelectorAll(".menuGroup.open");
          for (const otherGroup of openGroups) {
            if (otherGroup === group) continue;

            const active = document.activeElement;
            if (active && otherGroup.contains(active)) {
              toggleButton.focus({ preventScroll: true });
            }

            otherGroup.classList.remove("open");

            const otherToggle = otherGroup.querySelector("button[data-toggle]");
            if (otherToggle) {
              otherToggle.setAttribute("aria-expanded", "false");
              const otherSubmenuId = otherToggle.getAttribute("aria-controls");
              const otherSubmenu = otherSubmenuId
                ? document.getElementById(otherSubmenuId)
                : null;
              if (otherSubmenu)
                otherSubmenu.setAttribute("aria-hidden", "true");
            }
          }
        }

        group.classList.toggle("open", nextOpen);
        toggleButton.setAttribute("aria-expanded", nextOpen ? "true" : "false");

        const submenuId = toggleButton.getAttribute("aria-controls");
        const submenu = submenuId ? document.getElementById(submenuId) : null;
        if (submenu)
          submenu.setAttribute("aria-hidden", nextOpen ? "false" : "true");

        return;
      }

      const submenuItem = e.target?.closest?.("button.submenuItem[data-url]");
      const url = submenuItem?.dataset?.url;
      const kind = submenuItem?.dataset?.kind;
      if (!url) return;

      if (kind === "scripts" || kind === "stylesheets") {
        void renderSourceFromUrl(url);
        setMenuOpen(false);
      }

      if (kind === "images") {
        void renderImageFromUrl(url);
        setMenuOpen(false);
      }
    });

    document.addEventListener("click", (e) => {
      if (!isMenuOpen()) return;
      if (menuContainer.contains(e.target)) return;
      setMenuOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isMenuOpen()) {
        setMenuOpen(false);
      }
    });
  }

  const params = new URLSearchParams(globalThis.location?.search ?? "");
  const tabIdParam = params.get("tabId");
  const tabId = tabIdParam ? Number(tabIdParam) : null;

  let tab;
  if (tabId && Number.isFinite(tabId)) {
    tab = await chrome.tabs.get(tabId);
  } else {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  }

  currentPageUrl = tab?.url ?? null;
  chrome.tabs.onUpdated.addListener((updatedTabId, changeInfo) => {
    if (updatedTabId === tab?.id && changeInfo.url) {
      // Reload the side panel when the active tab's URL changes.
      window.location.reload();
    }
  });

  await renderSourceFromUrl(tab?.url);

  // getting document info from the active tab
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type === "DOCUMENT_INFO") {
      const docInfo = message.data;
      if (!docInfo) return;

      if (sender?.tab?.id && tab?.id && sender.tab.id !== tab.id) return;

      const scriptsEl = document.getElementById("menu-scripts");
      const stylesheetsEl = document.getElementById("menu-stylesheets");
      const imagesEl = document.getElementById("menu-images");

      const scriptsGroup = burgerMenu?.querySelector?.(
        '.menuGroup[data-group="scripts"]',
      );
      const stylesheetsGroup = burgerMenu?.querySelector?.(
        '.menuGroup[data-group="stylesheets"]',
      );
      const imagesGroup = burgerMenu?.querySelector?.(
        '.menuGroup[data-group="images"]',
      );

      const displayNameFromUrl = (urlString) => {
        if (typeof urlString !== "string") return String(urlString);
        try {
          const url = new URL(urlString);
          const parts = url.pathname.split("/").filter(Boolean);
          const last = parts.at(-1);
          return last ? decodeURIComponent(last) : url.hostname;
        } catch {
          const parts = urlString.split("/").filter(Boolean);
          return parts.at(-1) ?? urlString;
        }
      };

      const populateSubmenu = (container, urls, kind) => {
        if (!container) return;
        container.replaceChildren();
        if (!Array.isArray(urls)) return;

        const names = urls
          .filter((u) => typeof u === "string" && u.length)
          .map((u) => ({ url: u, name: displayNameFromUrl(u) }));

        for (const { url, name } of names) {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "submenuItem";
          item.setAttribute("role", "menuitem");
          if (kind) item.dataset.kind = kind;
          item.dataset.url = url;
          item.title = url;
          item.textContent = name;
          container.appendChild(item);
        }

        return names.length;
      };

      const scriptsCount =
        populateSubmenu(scriptsEl, docInfo.scripts, "scripts") ?? 0;
      const stylesheetsCount =
        populateSubmenu(stylesheetsEl, docInfo.styleSheets, "stylesheets") ?? 0;
      const imagesCount =
        populateSubmenu(imagesEl, docInfo.images, "images") ?? 0;

      const setGroupVisible = (groupEl, visible) => {
        if (!groupEl) return;
        groupEl.hidden = !visible;
        if (!visible) {
          const active = document.activeElement;
          if (active && groupEl.contains(active)) {
            burgerButton?.focus({ preventScroll: true });
          }
          groupEl.classList.remove("open");
          const toggle = groupEl.querySelector("button[data-toggle]");
          if (toggle) {
            toggle.setAttribute("aria-expanded", "false");
            const submenuId = toggle.getAttribute("aria-controls");
            const submenu = submenuId
              ? document.getElementById(submenuId)
              : null;
            if (submenu) submenu.setAttribute("aria-hidden", "true");
          }
        }
      };

      setGroupVisible(scriptsGroup, scriptsCount > 0);
      setGroupVisible(stylesheetsGroup, stylesheetsCount > 0);
      setGroupVisible(imagesGroup, imagesCount > 0);

      menuContainer?.classList.add("ready");
    }
  });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content-script.js"],
  });
})();
