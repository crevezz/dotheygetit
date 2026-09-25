/* Design tokens for every ad we make. Single source of truth.
   Colours are lifted straight from landing.html so the ads and the site
   are visibly the same brand. Change a value here, every ad changes. */

const colors = {
  bg:      '#070b16',
  bg2:     '#0b1122',
  surface: '#111a2e',
  line:    '#25324e',
  text:    '#eaf0ff',
  muted:   '#94a3c4',
  accent:  '#4f8cff',
  accent2: '#8b5cff',
  green:   '#3ddc84',
  amber:   '#ffc857',
  red:     '#ff6b6b',
};

/* The gradient that does all the brand work. */
const gradients = {
  brand: `linear-gradient(96deg, ${colors.accent}, ${colors.accent2})`,
  text:  `linear-gradient(96deg, #7db4ff, ${colors.accent} 42%, ${colors.accent2})`,
};

/* Type is sized in `u` - one unit is 1% of the SHORT side of the canvas.
   Short side, not vh: on a wide banner vh would shrink the type to nothing.
   Ratios, not pixels, so one template scales to every canvas. */
const type = {
  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  badge:  1.95,
  head:   8.6,
  foot:   2.35,
  leading: 1.07,
  tracking: '-0.03em',
};

/* The padding grid. Everything sits inside this. */
const space = { x: 8, y: 9, gap: 5 };

/* Every canvas we ship, at its true platform size.
   k is the type multiplier: a short canvas needs proportionally bigger type
   to stay legible, so wide banners run hot.
   spread pins the badge to the top and the mark to the bottom, with the
   headline floating between - the way a real story ad is built.
   deviceScaleFactor 2 doubles the pixels: the platform downsamples and
   text stays razor sharp on retina. */
const sizes = [
  { id: 'square', w: 1080, h: 1080, k: 1,    use: 'Instagram grid, Facebook square' },
  { id: 'feed',   w: 1080, h: 1350, k: 1,    use: 'Instagram feed, Facebook feed' },
  /* TikTok/Reels cover the top (tabs), bottom (caption + buttons) and right
     (action icons) of a 1080x1920 frame. padT/R/B/L are extra insets in u so
     the badge, footer and CTA all land inside the visible safe area. */
  { id: 'story',  w: 1080, h: 1920, k: 1.12, spread: true, use: 'Stories, Reels, TikTok, Shorts',
    padT: 32, padR: 20, padB: 140, padL: 10 },
  { id: 'hd',     w: 1920, h: 1080, k: 1.3,  use: 'Landing page hero, YouTube 16:9' },
  { id: 'wide',   w: 1200, h: 628,  k: 1.55, use: 'Link ads, LinkedIn, X, Google' },
];

/* Legibility floor. Below this the ad is a blur on a phone, so we refuse
   to render it. Measured in device pixels, before the platform downsamples. */
const MIN_PX = 18;
const MIN_HEAD_PX = 55;

const SCALE = Number(process.env.AD_SCALE || 2);

module.exports = { colors, gradients, type, space, sizes, SCALE, MIN_PX, MIN_HEAD_PX };
