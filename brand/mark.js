/* Get It? - the brand mark, in one place.
   Everything else (favicon, app icon, OG image, banner) is generated from this,
   so the tick and the gradient can never drift apart. */

const GRAD = `
  <linearGradient id="gi" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7db4ff"/>
    <stop offset=".42" stop-color="#4f8cff"/>
    <stop offset="1" stop-color="#8b5cf6"/>
  </linearGradient>`;

// The tick, drawn on a 256 grid.
const TICK = (w, c) =>
  `<path d="M62 133 L107 178 L195 84" fill="none" stroke="${c}" stroke-width="${w}"
     stroke-linecap="round" stroke-linejoin="round"/>`;

/**
 * The mark.
 * @param {object} o
 *  size    px canvas
 *  radius  corner radius on the 256 grid (0 = full bleed square)
 *  scale   how big the tick is relative to the tile (maskable icons need < 1)
 *  plain   drop the gradient tile and just draw the tick (for watermarks)
 */
function mark({ size = 256, radius = 58, scale = 1, plain = false, weight = 26 } = {}) {
  const inner = 256 * scale;
  const off = (256 - inner) / 2;
  const body = plain
    ? TICK(weight, '#ffffff')
    : `<rect width="256" height="256" rx="${radius}" fill="url(#gi)"/>` + TICK(weight, '#ffffff');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}">
  <defs>${plain ? '' : GRAD}</defs>
  <g transform="translate(${off} ${off}) scale(${scale})">${body}</g>
</svg>`;
}

/* Just the tick, no tile - for stamping on photos / video end cards. */
function tick({ size = 256, colour = '#ffffff' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}">
  ${TICK(28, colour)}
</svg>`;
}

const PALETTE = {
  accent: '#4f8cff',
  accentSoft: '#7db4ff',
  purple: '#8b5cf6',
  green:  '#3ddc84',
  amber:  '#ffc857',
  red:    '#ff6b6b',
  ink:    '#070b16',
  ink2:   '#0d1424',
  text:   '#eef3ff',
  muted:  '#93a3c4',
  line:   'rgba(120,150,210,.22)'
};

module.exports = { mark, tick, PALETTE };
