export const createMenu = ({
  menuContainer,
  burgerButton,
  burgerMenu,
  groups,
  state,
  render,
  probeAndNavigate,
  inferLanguageFromUrl,
  extrasCache,
}) => {
  const setActiveMenuEl = (el) => {
    for (const prev of burgerMenu.querySelectorAll(".isActive")) {
      prev.classList.remove("isActive");
    }
    if (el) el.classList.add("isActive");
  };

  const menu = {
    setOpen(open) {
      if (!open) {
        const active = document.activeElement;
        if (active && burgerMenu.contains(active)) {
          burgerButton.focus({ preventScroll: true });
        }
      }

      menuContainer.classList.toggle("open", open);
      burgerButton.setAttribute("aria-expanded", open ? "true" : "false");
      burgerMenu.setAttribute("aria-hidden", open ? "false" : "true");
      burgerMenu.toggleAttribute("inert", !open);
    },

    isOpen() {
      return menuContainer.classList.contains("open");
    },

    show() {
      menuContainer.classList.add("ready");
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
        burgerButton.focus({ preventScroll: true });
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

      const kSegment = segments.find((s) => s.startsWith("k="));
      const mSegment = segments.find((s) => s.startsWith("m="));
      const vSegment = segments.find((s) => s.startsWith("v="));

      let candidate = kSegment ?? mSegment ?? vSegment ?? lastSegment;
      candidate = candidate ? decodeURIComponent(candidate) : "";

      if (!candidate) return url.hostname;

      const xjs = url.searchParams.get("xjs");
      const suffix = xjs ? ` (xjs=${shortenMiddle(xjs, 18)})` : "";

      const looksLikeFilename =
        candidate.length <= 60 && /\.[a-z0-9]{1,6}$/i.test(candidate);
      if (looksLikeFilename) return candidate;

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

      if (kind === "extras") {
        const row = document.createElement("div");
        row.className = "submenuRow";

        const item = document.createElement("button");
        item.type = "button";
        item.className = "submenuItem";
        item.setAttribute("role", "menuitem");
        item.dataset.kind = kind;
        item.dataset.url = url;
        item.title = url;
        item.textContent = displayNameFromUrl(url, i);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "submenuRemove";
        remove.setAttribute("role", "menuitem");
        remove.setAttribute("aria-label", "Remove");
        remove.dataset.kind = kind;
        remove.dataset.url = url;
        remove.textContent = "×";

        row.appendChild(item);
        row.appendChild(remove);
        fragment.appendChild(row);
      } else {
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
    }

    container.appendChild(fragment);
    return count;
  };

  const init = () => {
    menuContainer.classList.remove("ready");
    burgerMenu.toggleAttribute("inert", true);

    burgerButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu.setOpen(!menu.isOpen());
    });

    burgerMenu.addEventListener("click", (e) => {
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

      const removeButton = e.target?.closest?.(
        "button.submenuRemove[data-kind=\"extras\"][data-url]",
      );
      if (removeButton) {
        e.preventDefault();
        e.stopPropagation();

        const url = removeButton.dataset.url;
        if (!url || typeof url !== "string") return;

        if (Array.isArray(state.extras) && state.extras.length > 0) {
          const next = state.extras.filter((u) => u !== url);
          if (next.length !== state.extras.length) {
            state.extras = next;

            const active = burgerMenu.querySelector(".isActive[data-url]");
            if (active?.dataset?.url === url) setActiveMenuEl(null);

            const extrasCount = populateSubmenu("extras", state.extras);
            setGroupVisible("extras", extrasCount > 0);

            void extrasCache?.saveForPageUrl?.(state.pageUrl, state.extras);

            groups.extras?.toggle?.focus?.({ preventScroll: true });
          }
        }

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
        return;
      }

      if (kind === "extras" && typeof probeAndNavigate === "function") {
        setActiveMenuEl(itemButton);
        void probeAndNavigate(url, {
          languageHint:
            typeof inferLanguageFromUrl === "function"
              ? inferLanguageFromUrl(url)
              : null,
        });
        menu.setOpen(false);
      }
    });

    document.addEventListener("click", (e) => {
      if (!menu.isOpen()) return;
      if (menuContainer.contains(e.target)) return;
      menu.setOpen(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.isOpen()) {
        menu.setOpen(false);
      }
    });
  };

  const populateFromDocInfo = (docInfo) => {
    state.docInfoReady = true;
    state.knownResourceUrls = new Set([
      ...(Array.isArray(docInfo?.scripts) ? docInfo.scripts : []),
      ...(Array.isArray(docInfo?.styleSheets) ? docInfo.styleSheets : []),
      ...(Array.isArray(docInfo?.images) ? docInfo.images : []),
    ]);

    // If the user entered URLs before docInfo was ready, process them now.
    if (Array.isArray(state.pendingExtras) && state.pendingExtras.length > 0) {
      const pending = state.pendingExtras;
      state.pendingExtras = [];
      for (const url of pending) {
        if (typeof url !== "string" || url.length === 0) continue;
        if (state.knownResourceUrls?.has?.(url)) continue;
        if (!Array.isArray(state.extras)) state.extras = [];
        if (state.extras.includes(url)) continue;
        state.extras.push(url);
      }
    }

    // Remove anything that is now part of the known resource lists.
    if (Array.isArray(state.extras) && state.extras.length > 0) {
      const filtered = state.extras.filter(
        (u) => !state.knownResourceUrls?.has?.(u),
      );
      if (filtered.length !== state.extras.length) {
        state.extras = filtered;
        void extrasCache?.saveForPageUrl?.(state.pageUrl, state.extras);
      }
    }

    const scriptsCount = populateSubmenu("scripts", docInfo.scripts);
    const stylesheetsCount = populateSubmenu(
      "stylesheets",
      docInfo.styleSheets,
    );
    const imagesCount = populateSubmenu("images", docInfo.images);
    const extrasCount = populateSubmenu("extras", state.extras);

    setGroupVisible("scripts", scriptsCount > 0);
    setGroupVisible("stylesheets", stylesheetsCount > 0);
    setGroupVisible("images", imagesCount > 0);
    setGroupVisible("extras", extrasCount > 0);

    menu.show();
  };

  const maybeAddExtraUrl = (url) => {
    if (typeof url !== "string" || url.length === 0) return;

    if (!state.docInfoReady) {
      if (!Array.isArray(state.pendingExtras)) state.pendingExtras = [];
      if (!state.pendingExtras.includes(url)) state.pendingExtras.push(url);
      return;
    }

    if (state.knownResourceUrls?.has?.(url)) return;
    if (Array.isArray(state.extras) && state.extras.includes(url)) return;

    if (!Array.isArray(state.extras)) state.extras = [];
    state.extras.push(url);

    const extrasCount = populateSubmenu("extras", state.extras);
    setGroupVisible("extras", extrasCount > 0);

    void extrasCache?.saveForPageUrl?.(state.pageUrl, state.extras);
  };

  return {
    init,
    menu,
    setActiveMenuEl,
    populateFromDocInfo,
    maybeAddExtraUrl,
  };
};
