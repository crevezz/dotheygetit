/* Get It? - the brand mark, in one place.
   Everything else (favicon, app icon, OG image, banner) is generated from this,
   so the tick and the gradient can never drift apart. */

const GRAD = `
  <linearGradient id="gi" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7db4ff"/>
    <stop offset=".42" stop-color="#4f8cff"/>
    <stop offset="1" stop-color="#8b5cf6"/>
  </linearGradient>`;

// The tick, drawn on a 256 grid. Traced off the chosen logo (c4-two-strokes) and
// then searched against its alpha mask until the drawn shape stopped disagreeing
// with it: 98.7% overlap, so this is that mark, not an impression of it.
const TICK = (w, c) =>
  `<path d="M51.5 135.3 L98.9 184.3 L204.6 71.8" fill="none" stroke="${c}" stroke-width="${w}"
     stroke-linecap="round" stroke-linejoin="round"/>`;

/**
 * The mark.
 * @param {object} o
 *  size         px canvas
 *  radius       corner radius on the 256 grid (0 = full bleed square)
 *  scale        how big the tick is relative to the tile (maskable icons need < 1)
 *  plain        drop the tile, draw the tick in white (for watermarks)
 *  transparent  drop the tile, draw the tick in the gradient (a logo with no
 *               background at all - nothing to knock out, it is transparent)
 */
function mark({ size = 256, radius = 58, scale = 1, plain = false, transparent = false,
                weight = 39 } = {}) {
  const inner = 256 * scale;
  const off = (256 - inner) / 2;
  const bare = plain || transparent;
  const ink = transparent ? 'url(#gi)' : '#ffffff';
  const body = bare
    ? TICK(weight, ink)
    : `<rect width="256" height="256" rx="${radius}" fill="url(#gi)"/>` + TICK(weight, '#ffffff');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}">
  <defs>${bare && !transparent ? '' : GRAD}</defs>
  <g transform="translate(${off} ${off}) scale(${scale})">${body}</g>
</svg>`;
}

/* Just the tick, no tile - for stamping on photos / video end cards. */
function tick({ size = 256, colour = '#ffffff' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="${size}" height="${size}">
  ${TICK(39, colour)}
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
