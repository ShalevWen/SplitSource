const fs = require("fs");
const path = require("path");

const ROOT = path.normalize(path.join(__dirname, ".."));
const DIST = path.join(ROOT, "dist");

function copy(src, dest) {
  if (!fs.existsSync(src)) return;

  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copy(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function clean() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST);
}

function build() {
  clean();

  // Core extension files
  copy(path.join(ROOT, "manifest.json"), path.join(DIST, "manifest.json"));
  copy(path.join(ROOT, "background.js"), path.join(DIST, "background.js"));
  copy(
    path.join(ROOT, "content-script.js"),
    path.join(DIST, "content-script.js"),
  );

  // Folders you actually use
  copy(path.join(ROOT, "sidepanel"), path.join(DIST, "sidepanel"));
  copy(path.join(ROOT, "assets"), path.join(DIST, "assets"));
  copy(path.join(ROOT, "images"), path.join(DIST, "images"));

  // Only copy speed-highlight/dist
  copy(
    path.join(ROOT, "speed-highlight", "dist"),
    path.join(DIST, "speed-highlight", "dist"),
  );

  console.log("Extension build complete → dist/");
}

build();
