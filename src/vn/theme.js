// The look of the game's chrome, in one place so the title, dialogue and end
// screens cannot drift apart.
//
// Warm rather than technical: cream panels, a rose name plate, brown text.
// The earlier palette was dark navy with a cyan hairline, which reads as a
// sci-fi HUD and fought with the character art - she is a girl in a cream
// slip dress in a sunlit classroom.
export const THEME = {
  // Dialogue panel
  panel: 'rgba(255, 252, 248, 0.94)',
  panelEdge: 'rgba(198, 156, 148, 0.55)',
  panelShadow: 'rgba(92, 62, 56, 0.28)',

  // Text
  text: '#4b3a34',
  textSoft: '#8b7169',

  // The speaker's name plate
  plate: '#ee92a6',
  plateEdge: 'rgba(255, 255, 255, 0.9)',
  plateText: '#fffaf9',

  // Choices and the little "carry on" arrow
  accent: '#e0748c',
  choice: '#6f5a55',
  choiceActive: '#fffaf9',
  choicePill: '#f2a4b4',

  // Title and end screens
  skyTop: '#fff1f1',
  skyMid: '#ffe6e4',
  skyBottom: '#ffd9d2',
  titleText: '#6a4a46',
  titleGlow: 'rgba(255, 176, 180, 0.9)',
};

// Rounded rectangle path. Canvas has roundRect() now, but not everywhere this
// has to run, and the fallback is four lines.
export function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// The soft warm wash behind the title and end screens.
export function paintSky(ctx, width, height) {
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, THEME.skyTop);
  grad.addColorStop(0.55, THEME.skyMid);
  grad.addColorStop(1, THEME.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}
