// Canvas drawing needs concrete colours. They come from the page's CSS tokens,
// so canvases follow the light and dark theme like everything else.

const TOKENS = ['bg', 'surface', 'ink', 'ink-2', 'line', 'asphalt', 'kerb', 'infield', 'car', 'car-out', 'lead', 'lead-car', 'ray', 'pos', 'neg'];

export function readTheme() {
  const style = getComputedStyle(document.documentElement);
  const theme = {};
  for (const name of TOKENS) theme[name] = style.getPropertyValue(`--${name}`).trim() || '#888';
  return theme;
}

/** Calls `callback` whenever the theme may have changed. */
export function onThemeChange(callback) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', callback);
  new MutationObserver(callback).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/** Sizes a canvas backing store to its CSS box and device pixel ratio. Returns true if it changed. */
export function fitCanvas(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}
