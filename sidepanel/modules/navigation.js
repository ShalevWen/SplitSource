import {
  canPlayAudioMime,
  classifyMimeType,
  getFilenameFromPathname,
  inferAudioMimeFromUrl,
  inferLanguageFromContentType,
  inferLanguageFromUrl,
  isHttpUrl,
} from "./utils.js";

export const createNavigator = ({ state, render }) => {
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

  const getPageOrigin = () => {
    try {
      return state.pageUrl ? new URL(state.pageUrl).origin : null;
    } catch {
      return null;
    }
  };

  const probeAndNavigate = async (nextUrlString, opts = {}) => {
    if (!isHttpUrl(nextUrlString)) {
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

    const pageOrigin = getPageOrigin();
    if (pageOrigin && nextUrl.origin !== pageOrigin) return;

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
      await render.source(nextUrl.toString(), {
        ...opts,
        languageHint:
          opts?.languageHint ||
          inferLanguageFromContentType(contentType) ||
          inferLanguageFromUrl(nextUrl.toString()),
      });
      return;
    }

    await downloadUrl(nextUrl.toString());
  };

  return {
    probeAndNavigate,
  };
};
