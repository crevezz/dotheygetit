/* The master ad design. One template string, shared by the stills (ad.js) and
   the films (ad-film.js), so the two can never drift apart.

   page(ad, size)            -> static HTML
   page(ad, size, {film:1})  -> the same design plus window.__at(t), which puts
                                the design into its exact state at time t.
                                The film script drives that and shoots frames,
                                which is why the motion is deterministic: no
                                CSS animation clock to race, no dropped frames,
                                and a re-render is bit-for-bit repeatable.
*/
const fs = require('fs');
const path = require('path');
const T = require('./tokens');

const BADGE = 'Free for teachers';
const DOMAIN = 'dotheygetit.app';

/* Inlined as a data URI: setContent has no base URL, so a relative <img>
   would never load and the mark would vanish from every ad. */
const TICK = 'data:image/svg+xml;base64,' +
  fs.readFileSync(path.join(__dirname, '..', 'brand', 'out', 'tick-white.svg')).toString('base64');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------ the motion */
/* Every beat is (start, duration) in seconds. The film is as long as the
   template says it is - MOTION.total - so nothing can be cut short. */
const MOTION = {
  total: 4.0,
  hold: 1.9,      // everything has landed by here; the rest is the hold
  badge: [0.15, 0.55],
  a:     [0.45, 0.70],
  b:     [0.72, 0.70],
  rules: [1.05, 0.60],
  foot:  [1.35, 0.55],
};

function page(ad, size, opts = {}) {
  const t = T.type, s = T.space, c = T.colors;
  const film = opts.film ? motionScript() : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:${c.bg};color:${c.text}}
/* u = 1% of the short side, times the canvas's type multiplier k.
   Every measurement in the template is a multiple of u, so one template
   works on a square, a story and a wide banner without re-tuning. */
.card{--u:calc(min(100vw, 100vh) / 100 * ${size.k});
 color:${c.text};
 position:relative;width:100vw;height:100vh;display:flex;flex-direction:column;
 justify-content:${size.spread ? 'space-between' : 'center'};gap:calc(var(--u) * ${s.gap});padding:calc(var(--u) * ${size.padT ?? s.y}) calc(var(--u) * ${size.padR ?? s.x}) calc(var(--u) * ${size.padB ?? s.y}) calc(var(--u) * ${size.padL ?? s.x});
 overflow:hidden;
 background:radial-gradient(120% 70% at 78% 6%,rgba(79,140,255,.30),transparent 60%),
            radial-gradient(90% 60% at 10% 100%,rgba(139,92,246,.20),transparent 62%),#070a1a;
 font-family:${t.family};-webkit-font-smoothing:antialiased}
/* vignette: pulls the eye to the centre and makes the type sit forward */
.card:after{content:"";position:absolute;inset:0;pointer-events:none;
 background:radial-gradient(125% 92% at 50% 44%,transparent 44%,rgba(0,0,0,.58))}
.badge{align-self:flex-start;background:${T.gradients.brand};color:#fff;
 font-weight:800;letter-spacing:.14em;text-transform:uppercase;font-size:calc(var(--u) * ${t.badge});
 padding:calc(var(--u) * 1.5) calc(var(--u) * 2.7);border-radius:999px;
 box-shadow:0 18px 44px rgba(79,140,255,.35);z-index:2}
.type{position:relative;z-index:2}
.a,.b{font-size:calc(var(--u) * ${t.head});line-height:${t.leading};font-weight:800;max-width:100%;overflow-wrap:break-word;word-break:normal;hyphens:none;
 letter-spacing:${t.tracking};margin:0;text-wrap:balance}
.a{color:${c.text}}
.b{background:${T.gradients.text};-webkit-background-clip:text;background-clip:text;color:transparent}
.rules{margin-top:calc(var(--u) * 1.5);display:flex;gap:calc(var(--u) * 1.2)}
.rules i{height:calc(var(--u) * .55);flex:1;background:rgba(255,255,255,.14);border-radius:999px;
 transform-origin:left center}
.foot{margin-top:calc(var(--u) * 3.5);flex-shrink:0;display:flex;align-items:center;gap:calc(var(--u) * 1.8);
 color:${c.muted};font-size:calc(var(--u) * ${t.foot});font-weight:600;z-index:2}
.foot b{color:#fff;font-weight:800}\n.foot .pitch{line-height:1.35;flex:1}\n.foot .cta{flex:0 0 auto;background:${T.gradients.brand};color:#fff;font-weight:800;padding:calc(var(--u) * 1.5) calc(var(--u) * 2.6);border-radius:999px;box-shadow:0 14px 34px rgba(79,140,255,.35);white-space:nowrap}\n.foot img{height:calc(var(--u) * 3.6);display:block}\n${size.id === 'story' ? `.foot{flex-direction:column;align-items:flex-start;gap:calc(var(--u) * 1.4);max-width:70%}\n.foot .cta{align-self:flex-start}` : ''}
${film ? `
/* filming only: hold everything out of the way until __at() places it, so the
   page never flashes its finished state on the first frame */
.a,.b,.badge,.rules i,.foot{opacity:0}
.a,.b{will-change:transform,opacity,filter}
.badge,.foot,.rules i{will-change:transform,opacity}
` : ''}
${ad.hook ? `
/* hook frame: 1-2s scroll-stopper before the real ad. Reuses .a/.b/.badge/.foot
   so the QA audit and the entrance animation both work unchanged; the badge
   text is empty and hidden, and .a/.b are centred and coloured as a warning. */
.card{justify-content:center;align-items:center;text-align:center;background:#070a1a;padding-top:calc(var(--u) * 30) !important;padding-bottom:calc(var(--u) * 30) !important}
.card .badge{opacity:0 !important}
.card .a,.card .b{font-size:calc(var(--u) * ${t.head} * 1.05);text-transform:uppercase;letter-spacing:.02em}
.card .a{color:#fff}
.card .b{background:linear-gradient(96deg,#ff5a5f,#ff8a3d);-webkit-background-clip:text;background-clip:text;color:transparent}
.card .rules,.card .foot{display:none}
` : ''}
</style></head><body><div class="card">
  <div class="badge">${BADGE}</div>
  <div class="type">
    <p class="a">${esc(ad.a)}</p>
    <p class="b">${esc(ad.b)}</p>
    <div class="rules"><i></i><i></i><i></i><i></i></div>
  </div>
  <div class="foot"><img src="${TICK}" alt=""><span class="pitch"><b>Get It?</b> &middot; the free 2-minute understanding check for teachers<br>${DOMAIN}</span><span class="cta">Try it free &rarr;</span></div>
</div>
${film}
</body></html>`;
}

/* ------------------------------------------------------- the film script */
/* Puts the design into its exact state at time t. Elements start hidden in a
   way that only exists when filming, so the stills are never affected. */
function motionScript() {
  const M = JSON.stringify(MOTION);
  return `<script>
var M = ${M};
var q = function (s) { return document.querySelector(s); };
var bars = [].slice.call(document.querySelectorAll('.rules i'));

var out = function (e, p) { e.style.opacity = p; };
var ease = function (t) { t = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - t, 3); };
var at = function (beat, t) { return ease((t - beat[0]) / beat[1]); };

/* one element's entrance: rise, sharpen and fade, all on the same curve */
function rise(e, p, dist, blur) {
  if (!e) return;
  e.style.opacity = p;
  e.style.transform = 'translateY(' + ((1 - p) * dist).toFixed(2) + 'px) scale(' + (0.94 + 0.06 * p).toFixed(4) + ')';
  e.style.filter = blur ? 'blur(' + ((1 - p) * blur).toFixed(2) + 'px)' : 'none';
}

window.__len = M.total;
window.__at = function (t) {
  var pb = at(M.badge, t), pa = at(M.a, t), pbb = at(M.b, t), pr = at(M.rules, t), pf = at(M.foot, t);

  var badge = q('.badge');
  if (badge) {
    badge.style.opacity = pb;
    badge.style.transform = 'scale(' + (0.86 + 0.14 * pb).toFixed(4) + ')';
  }

  rise(q('.a'), pa, 40, 14);
  rise(q('.b'), pbb, 40, 14);

  bars.forEach(function (b, i) {
    /* the four rules draw left to right, not all at once */
    var p = ease((t - (M.rules[0] + i * 0.07)) / M.rules[1]);
    b.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  });

  var foot = q('.foot');
  if (foot) {
    foot.style.opacity = pf;
    foot.style.transform = 'translateY(' + ((1 - pf) * 14).toFixed(2) + 'px)';
  }
};
window.__at(0);
</script>`;
}

module.exports = { page, MOTION, esc, BADGE, DOMAIN, TICK };