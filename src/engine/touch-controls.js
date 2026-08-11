// On-screen touch buttons for phones and tablets.
//
// The DOM markup and CSS live in index.html (`#touch-controls`); this module
// only wires that markup's `[data-action]` buttons to Input.touchDown()/
// touchUp(), the same action names the keyboard and gamepad already use.
// Nothing else in the game distinguishes a touch press from a key press.
//
// Controls are hidden by default and only revealed on a coarse (touch)
// pointer, so a mouse/keyboard player never sees them and a hybrid device
// (a touch laptop, say) that also has a keyboard isn't cluttered unless it's
// actually being used with touch.
export function setupTouchControls(input, root = document) {
  const container = root.getElementById('touch-controls');
  if (!container) return;

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!isTouch) return;

  container.classList.add('visible');
  root.body.classList.add('touch-active');

  for (const btn of container.querySelectorAll('[data-action]')) {
    const action = btn.dataset.action;
    let pressed = false; // guards against a duplicate pointerdown/up pair

    const press = (e) => {
      e.preventDefault();
      if (pressed) return;
      pressed = true;
      btn.classList.add('active');
      input.touchDown(action);
      // Best-effort: routes pointerup/pointercancel back to this button even
      // if the finger slides off it first. Wrapped because it can throw (a
      // pointer id the browser doesn't consider "active" at this instant) -
      // that must never take the actual button press down with it.
      try {
        btn.setPointerCapture?.(e.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
    };
    const release = (e) => {
      e.preventDefault?.();
      if (!pressed) return;
      pressed = false;
      btn.classList.remove('active');
      input.touchUp(action);
    };

    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
