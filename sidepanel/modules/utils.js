export const isHttpUrl = (url) =>
  typeof url === "string" && /^https?:/i.test(url);

export const inferLanguageFromUrl = (urlString) => {
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

export const inferLanguageFromContentType = (contentType) => {
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

export const getFilenameFromPathname = (pathname) => {
  if (typeof pathname !== "string") return "download";
  const last = pathname.split("/").filter(Boolean).at(-1);
  return last ? decodeURIComponent(last) : "download";
};

export const classifyMimeType = (contentType) => {
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

  return { kind: "download", mime };
};

export const inferAudioMimeFromUrl = (urlString) => {
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

export const canPlayAudioMime = (mime) => {
  if (typeof mime !== "string" || mime.length === 0) return true;

  try {
    const el = document.createElement("audio");
    const verdict = el.canPlayType(mime);
    return verdict === "probably" || verdict === "maybe";
  } catch {
    return true;
  }
};
