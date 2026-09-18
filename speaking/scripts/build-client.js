#!/usr/bin/env node
// Bundles the browser-side app (public/src/app.js, plus the puppet modules it
// imports) into public/app.bundle.js.
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

// The puppet is a copy of the animation code from the game it came from, so
// that this app stays self-contained and can be lifted out of the repo on its
// own. The cost of that is drift, so say so when the originals are in reach
// and no longer match.
function warnIfPuppetDrifted() {
  const pairs = [
    ["image-cache.js", "../src/engine/image-cache.js"],
    ["loop.js", "../src/engine/loop.js"],
    ["rig.js", "../src/vn/rig.js"],
    ["spring.js", "../src/vn/spring.js"],
    ["portrait-motion.js", "../src/vn/portrait-motion.js"],
    ["portrait-renderer.js", "../src/vn/portrait-renderer.js"],
    ["character.js", "../src/vn/character.js"],
  ];
  for (const [copy, original] of pairs) {
    const originalPath = path.join(root, original);
    if (!fs.existsSync(originalPath)) continue; // lifted out of the repo - fine
    const copyPath = path.join(root, "public", "src", "puppet", copy);
    if (fs.readFileSync(originalPath, "utf8") !== fs.readFileSync(copyPath, "utf8")) {
      console.warn(`⚠️  public/src/puppet/${copy} has drifted from ${original}`);
    }
  }
}

warnIfPuppetDrifted();

esbuild
  .build({
    entryPoints: [path.join(root, "public", "src", "app.js")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    outfile: path.join(root, "public", "app.bundle.js"),
    logLevel: "info",
  })
  .catch(() => process.exit(1));
