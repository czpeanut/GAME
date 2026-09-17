export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Frame-rate independent exponential smoothing. `rate` is roughly "how much of
// the gap is closed per second"; higher is snappier.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// Move `a` toward `b` by at most `maxDelta`.
export function approach(a, b, maxDelta) {
  if (a < b) return Math.min(a + maxDelta, b);
  if (a > b) return Math.max(a - maxDelta, b);
  return b;
}

export function aabb(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInQuad = (t) => t * t;

// The source rectangle to crop from a `srcW`x`srcH` image so that drawing it
// into that rect fills a `dstW`x`dstH` destination with no letterboxing and
// no distortion (CSS `background-size: cover`, centered) - used for
// background art that was not pre-cropped to the render's exact aspect
// ratio, instead of the naive "stretch to fill" that squashes it.
export function coverRect(srcW, srcH, dstW, dstH) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const sw = dstW / scale;
  const sh = dstH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}
