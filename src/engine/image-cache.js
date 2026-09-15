// A tiny shared image loader. Loading is fire-and-forget: requesting a path
// starts the <img> loading immediately and the returned entry's `ready` flag
// flips to true whenever it arrives (or `failed` if it errors) - so callers
// can start drawing right away and simply skip anything not ready yet
// instead of blocking the whole app on every asset.
//
// A single cache is meant to be shared across everything that draws images
// (backgrounds, portraits, ...) so the same path is never fetched twice.
export class ImageCache {
  constructor() {
    this.entries = new Map();
  }

  get(src) {
    let entry = this.entries.get(src);
    if (entry) return entry;
    entry = { image: null, ready: false, failed: false };
    this.entries.set(src, entry);
    if (typeof Image === 'undefined') return entry; // non-browser (tests)
    const img = new Image();
    img.onload = () => {
      entry.image = img;
      entry.ready = true;
    };
    img.onerror = () => {
      entry.failed = true;
    };
    img.src = src;
    return entry;
  }
}
