// Internal render resolution: portrait 9:16, matching how this is actually
// held - a phone in the user's hand, not a landscape monitor. Everything
// (portraits, dialogue box, text) is laid out against this fixed size, and
// main.js scales the canvas to fit the real window/screen while preserving
// this aspect ratio, so a small letterbox on very tall/narrow modern phones
// is expected rather than stretching or cropping the layout itself.
export const VIEW = { width: 540, height: 960 };

export const FONT = '18px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
export const NAME_FONT = '16px "PingFang TC","Microsoft JhengHei","Noto Sans TC",sans-serif';
