const CHIP_ICONS = {"hand":"<path d=\"M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8\"/><path d=\"M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15\"/>","thumb":"<path d=\"M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 8a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 4 3.9z\"/>","book":"<path d=\"M4 19.5V4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5zM4 19.5A2.5 2.5 0 0 1 6.5 17H20\"/>","ticket":"<path d=\"M2 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 17v2M13 11v2\"/>","star":"<path d=\"M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z\"/>","note":"<path d=\"M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5z\"/><path d=\"M15 3v6h6\"/>","quote":"<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"/>","exam":"<path d=\"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\"/><path d=\"M14 2v6h6M8 13h8M8 17h5\"/>","cross":"<path d=\"M18 6 6 18M6 6l12 12\"/>","mic":"<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3\"/>","pen":"<path d=\"M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z\"/><path d=\"M3 3l18 18\"/>","target":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><circle cx=\"12\" cy=\"12\" r=\"6\"/><circle cx=\"12\" cy=\"12\" r=\"2\"/>","ask":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01\"/>"};
/* Scene library for the beat engine (beat-film.js).
 *
 * A "beat" is one moment of an ad: a line of on-screen text plus a picture.
 * This file draws the pictures. Every scene returns:
 *   { html, paint, cap }   cap: 'top' | 'center' | 'none'
 * and paint is a real function, stringified into the page, that puts a scene
 * into its exact state at time t within its beat (t in seconds, p = t/dur).
 *
 * Everything is measured in `u` (see tokens.js) so the same scene works on
 * any canvas. Scenes draw the product's own UI in HTML rather than screen
 * recording it: a recording races the animation, catches a stray cursor, and
 * cannot be re-rendered at a different size. This is deterministic.
 */
const T = require('./tokens');
const c = T.colors;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Safe areas, as a fraction of the frame.
   These are measured against the real UI furniture, in px on a 1080x1920
   frame, not guessed. The earlier numbers had two faults: the bottom inset was
   12.5% (240px) when TikTok's caption + nav and YouTube Shorts' title + action
   bar both eat the bottom ~400-420px, and the comment had the action rail on
   the wrong side - it is on the RIGHT (~150px), the left is nearly clear.

     TikTok vertical   top ~150  bottom ~400  left ~40  right ~150
     YT Shorts         top ~150  bottom ~420  left ~40  right ~150

   So story is t 9% (172px) b 22% (422px) l 7% (76px) r 15% (162px): every
   figure clears both platforms. */
const PADS = {
  story: { t: 9, r: 15, b: 22, l: 7 },
  feed: { t: 10, r: 10, b: 14, l: 8 },
  square: { t: 8.5, r: 8, b: 8.5, l: 8 },
  wide: { t: 9, r: 6.5, b: 9, l: 6.5 },
  hd: { t: 9, r: 6, b: 11, l: 6 },
};

/* The shared stylesheet. u is 1% of the short side x the canvas k. */
function css(size) {
  const u = `calc(min(100vw, 100vh) / 100 * ${size.k})`;
  const p = PADS[size.id] || PADS.feed;
  return `
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:${c.bg};color:${c.text};overflow:hidden}
.card{--u:${u};position:relative;width:100vw;height:100vh;overflow:hidden;
 font-family:${T.type.family};-webkit-font-smoothing:antialiased;
 background:radial-gradient(120% 70% at 78% 4%,rgba(79,140,255,.26),transparent 58%),
            radial-gradient(90% 60% at 6% 100%,rgba(139,92,246,.18),transparent 62%),${c.bg}}
.card:after{content:"";position:absolute;inset:0;pointer-events:none;z-index:9;
 background:radial-gradient(130% 96% at 50% 44%,transparent 46%,rgba(0,0,0,.6))}

/* --- one beat = one .scene, stacked and cross-faded by __at() --- */
.scene{position:absolute;inset:0;display:flex;flex-direction:column;opacity:0;overflow:hidden;
 gap:calc(var(--u) * 2.6);padding:calc(100vh * ${p.t / 100}) calc(100vw * ${p.r / 100})
   calc(100vh * ${p.b / 100}) calc(100vw * ${p.l / 100})}
.scene.centre{justify-content:center;align-items:center;text-align:center;z-index:5}
.stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;position:relative}
${size.id === 'hd' ? `.scene:not(.centre){flex-direction:row;align-items:center;gap:calc(var(--u) * 5)}
.scene:not(.centre) .cap{flex:0 0 36%}
.scene:not(.centre) .stage{align-self:stretch}
.scene:not(.centre) .cap .ln{font-size:calc(var(--u) * 6.2)}
.scene.centre .cap{max-width:78%}` : ''}

/* --- on-screen text --- */
.cap{flex:0 0 auto;position:relative;z-index:6}
.cap .ln{display:block;font-weight:800;letter-spacing:${T.type.tracking};line-height:1.06;
 font-size:calc(var(--u) * ${size.id === 'story' ? 6.3 : 5.4});text-wrap:balance;margin:0}
.cap .l1{color:#fff}
.cap .l2{background:${T.gradients.text};-webkit-background-clip:text;background-clip:text;color:transparent}
.scene.centre .cap .ln{font-size:calc(var(--u) * ${size.id === 'story' ? 8.4 : 7.2})}
.scene.centre .cap{max-width:88%}

/* small standing footer: the address, on every beat but the hook.
   Flush with the bottom of the safe area - at p.b * 0.42 it sat ~101px off the
   bottom, which is under TikTok's caption and nav bar. */
.wmark{position:absolute;left:calc(100vw * ${p.l / 100});bottom:calc(100vh * ${p.b / 100});
 z-index:8;display:flex;align-items:center;gap:calc(var(--u) * 1.4);opacity:0;
 color:${c.muted};font-size:calc(var(--u) * 2.1);font-weight:700;letter-spacing:.01em}
.wmark b{color:#fff;font-weight:800}
.wmark img{height:calc(var(--u) * 3);display:block}

/* --- room backdrop ---------------------------------------------------------
   The room scenes used to be drawings floating in a void: the classroom filled
   57% of the space left for it, the desk 31%, the corridor 32%. Whatever the
   picture did not cover read as dead space. This puts the picture in a room -
   wall light at the top, a floor line, a dark floor - and because it lives on
   .scene (which is the whole frame) it fills the padded margins too, instead of
   stopping short at the safe box and leaving a black frame around the art. */
.scene[data-scene="classroom"],.scene[data-scene="desk"],.scene[data-scene="corridor"]{
  background:
    radial-gradient(76% 42% at 50% 3%,rgba(79,140,255,.13),transparent 72%),
    radial-gradient(90% 50% at 50% 100%,rgba(139,92,246,.10),transparent 70%),
    linear-gradient(180deg,rgba(0,0,0,0) 0 54%,rgba(126,158,214,.085) 54% 54.5%,rgba(0,0,0,.42) 100%)}
/* Everything stays centred on both axes. A scaled picture grows about its own
   centre, so a bottom- or top-aligned one would push past the stage edge as soon
   as the fit scaled it up - the desk gear ran 75px past the bottom. Centred, the
   scale is symmetric and the fit it computes is the fit it gets. */

/* --- scene: classroom --- */
.cls{width:100%;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u) * 3)}
.board{width:90%;height:calc(var(--u) * 30);border-radius:calc(var(--u) * 1.2);
 background:linear-gradient(180deg,#101d33,#0c1729);border:1px solid ${c.line};
 display:grid;place-items:center;color:#d7e4ff;font-size:calc(var(--u) * 5.6);
 font-weight:700;letter-spacing:.02em;box-shadow:inset 0 -14px 30px rgba(0,0,0,.35);
 transform-origin:center top}
.rows{width:100%;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u) * 2.6)}
.rw{display:flex;justify-content:center;align-items:flex-end;gap:calc(var(--u) * 1.6);
 transform:scale(var(--s));opacity:0}
.deskband{width:100%;height:calc(var(--u) * 2.6);margin-top:calc(var(--u) * -2.8);
 border-radius:calc(var(--u) * 1.2) calc(var(--u) * 1.2) calc(var(--u) * .5) calc(var(--u) * .5);
 background:linear-gradient(180deg,#3b4d74,#26334e);border-top:calc(var(--u) * .35) solid #55709f;
 box-shadow:0 calc(var(--u) * 2) calc(var(--u) * 5) rgba(0,0,0,.5)}

.pup{position:relative;width:calc(var(--u) * 9);height:calc(var(--u) * 15);display:block}
.hd{position:absolute;left:50%;top:calc(var(--u) * .2);transform:translateX(-50%);
 width:calc(var(--u) * var(--hd,6));height:calc(var(--u) * var(--hd,6));border-radius:50%;
 background:linear-gradient(180deg,#31456b,#22314e)}
.sh{position:absolute;left:50%;bottom:0;transform:translateX(-50%);width:calc(var(--u) * var(--sw,10));
 height:calc(var(--u) * 8.6);border-radius:calc(var(--u) * 4.6) calc(var(--u) * 4.6) calc(var(--u) * .8) calc(var(--u) * .8);
 background:linear-gradient(180deg,#26364f,#1a2438)}

/* --- the raised arm ---------------------------------------------------------
   A single straight bar reads as a tube with no anatomy, so the arm is two
   segments with a real elbow: .arm is the upper arm and swings about the
   shoulder, .fa is the forearm nested inside it and bent a further --fb so the
   hand finishes near vertical. NOTHING here may use clip-path: clip-path clips
   the whole subtree, so a nested hand gets cut off at the wrist - which is
   exactly what happened when the sleeve was a clipped element. */
.arm{position:absolute;right:calc(var(--u) * 1.1);top:calc(var(--u) * -.5);
 height:calc(var(--u) * 4.6);width:calc(var(--u) * 2.5);
 transform-origin:bottom center;transform:rotate(-150deg);opacity:0}
.pup.alt .arm{right:auto;left:calc(var(--u) * 1.1);scale:-1 1}
.ua{position:absolute;inset:0;border-radius:calc(var(--u) * 1.25);
 background:linear-gradient(90deg,#2b3d5e,#3f5a84 62%,#4a6898);
 box-shadow:inset calc(var(--u) * -.35) 0 calc(var(--u) * .5) rgba(0,0,0,.35)}
.fa{position:absolute;left:50%;top:calc(var(--u) * -4.3);width:calc(var(--u) * 2.15);
 height:calc(var(--u) * 4.5);transform-origin:bottom center;
 transform:translateX(-50%) rotate(var(--fb,-22deg));
 border-radius:calc(var(--u) * 1.05);background:linear-gradient(180deg,#4a6898,#395379)}
.hand{position:absolute;left:50%;top:calc(var(--u) * -3.1);transform:translateX(-50%);
 width:calc(var(--u) * 2.9);height:calc(var(--u) * 3.5);
 border-radius:calc(var(--u) * 1.35) calc(var(--u) * 1.35) calc(var(--u) * 1) calc(var(--u) * 1);
 background:linear-gradient(180deg,#f2d3b0,#d9a97c);
 box-shadow:inset 0 calc(var(--u) * -.4) calc(var(--u) * .7) rgba(120,74,40,.3)}
/* three breaks = four fingers, so the hand is a hand and not a mitten */
.hand:before{content:"";position:absolute;left:calc(var(--u) * .3);right:calc(var(--u) * .3);
 top:calc(var(--u) * .45);height:calc(var(--u) * 2.1);
 background:repeating-linear-gradient(90deg,rgba(120,74,40,.34) 0 1px,transparent 1px 25%)}
.hand:after{content:"";position:absolute;left:calc(var(--u) * -.55);top:calc(var(--u) * 1.5);
 width:calc(var(--u) * 1.2);height:calc(var(--u) * 1.5);border-radius:99px;
 background:linear-gradient(180deg,#eec9a2,#cfa071);transform:rotate(-28deg)}

.pup.up .hd{background:radial-gradient(circle at 50% 66%,var(--sk) 0 56%,#0000 57%),var(--hr);box-shadow:0 0 0 calc(var(--u) * .25) rgba(0,0,0,.25)}
.pup.up .sh{background:linear-gradient(180deg,var(--jp),#1c2740)}
.pup.up .ua,.pup.up .fa{background:linear-gradient(90deg,var(--jp),color-mix(in srgb,var(--jp),#fff 18%))}
.pup.up .hand{background:linear-gradient(180deg,var(--sk),color-mix(in srgb,var(--sk),#000 18%))}
.pup.up .arm{height:calc(var(--u) * 4);width:calc(var(--u) * 3.1)}
.pup.up .fa{width:calc(var(--u) * 2.8);height:calc(var(--u) * 3.8);top:calc(var(--u) * -3.6)}
.pup.up .hand{width:calc(var(--u) * 3);height:calc(var(--u) * 3.5);top:calc(var(--u) * -3.1)}
.cls .board{box-shadow:0 0 0 calc(var(--u) * .9) #5b4632,0 calc(var(--u) * 1.2) 0 calc(var(--u) * .9) #3e2f22}
.pup.dim .hd{background:linear-gradient(180deg,#242f45,#1a2233)}
.pup.hi .hd{background:linear-gradient(180deg,#7db4ff,${c.accent})}
.pup.hi .sh{background:linear-gradient(180deg,#3b63a8,#26406e)}
.pup.hi{filter:drop-shadow(0 0 calc(var(--u) * 3) rgba(79,140,255,.55))}

/* --- scene: desk (night marking / day papers) --- */
.dk{position:relative;display:flex;align-items:flex-end;justify-content:center;gap:calc(var(--u) * 4);
 padding-bottom:calc(var(--u) * 1)}
.dk.night:before{content:"";position:absolute;left:50%;top:-14%;width:120%;height:80%;transform:translateX(-50%);
 background:radial-gradient(58% 48% at 50% 30%,rgba(255,196,120,.20),transparent 72%);pointer-events:none}
/* Flush with the stage, not bleeding past it. left:-4%;right:-4% pushed the
   desk edge to 41px from the left and 128px from the right, i.e. into the
   platform insets - and the fit audit skipped .tab entirely, so it never saw
   it. */
/* The tabletop is a scene-level band, not an element inside the picture.

   It used to be a .tab div inside the desk wrapper. When the wrapper is what
   gets scaled to fill, the tabletop scaled with it and ran 453px past the
   bottom of the frame on the small desk beats - and the audit kept flagging it
   as content outside the safe box. As a background band on .scene it never
   scales, it stays exactly where it was designed to sit, and it reads as the
   surface the gear is standing on. Backgrounds are allowed to bleed; content
   is not. */
.scene[data-scene="desk"]:before{content:"";position:absolute;left:0;right:0;bottom:0;height:34%;
 border-radius:calc(var(--u) * 2) calc(var(--u) * 2) 0 0;
 background:linear-gradient(180deg,#2b3550,#1d2537)}
.scene[data-scene="desk"][data-night="1"]:before{background:linear-gradient(180deg,#2a2216,#1c1710)}
.stack{position:relative;display:flex;flex-direction:column;align-items:center;z-index:2}
.stack i{display:block;width:var(--w,calc(var(--u) * 28));height:calc(var(--u) * 3.6);border-radius:calc(var(--u) * .5);
 background:linear-gradient(180deg,#22304c,#182238);border:1px solid #2d3d60;margin-bottom:calc(var(--u) * .5);
 box-shadow:0 calc(var(--u) * .6) calc(var(--u) * 1.2) rgba(0,0,0,.4);transform:translateX(var(--x,0))}
.sheet{position:relative;z-index:3;width:calc(var(--u) * 30);height:calc(var(--u) * 42);border-radius:calc(var(--u) * .8);
 background:linear-gradient(180deg,#eef2fa,#dfe6f4);box-shadow:0 calc(var(--u) * 2) calc(var(--u) * 4) rgba(0,0,0,.45);
 padding:calc(var(--u) * 2.4);display:flex;flex-direction:column;gap:calc(var(--u) * 1.3)}
.sheet u{display:block;height:calc(var(--u) * .9);border-radius:99px;background:#b9c4d8;opacity:.85}
.sheet u.short{width:62%}
.sheet .mark{position:relative;color:#d63b3b;font-weight:800;font-size:calc(var(--u) * 2.6);
 border:calc(var(--u) * .45) solid #e0453f;border-radius:50%;width:calc(var(--u) * 7.5);height:calc(var(--u) * 7.5);
 display:grid;place-items:center;transform:rotate(-9deg);align-self:flex-end;opacity:0}
.sheet .mk2{position:relative;color:#d63b3b;font-weight:800;font-size:calc(var(--u) * 2.6);
 border:calc(var(--u) * .45) solid #e0453f;border-radius:50%;width:calc(var(--u) * 7.5);height:calc(var(--u) * 7.5);
 display:grid;place-items:center;transform:rotate(-9deg);align-self:flex-end;opacity:0}
.sticky{position:absolute;right:6%;top:4%;z-index:4;width:calc(var(--u) * 16);height:calc(var(--u) * 12);
 background:linear-gradient(180deg,#ffe89a,#f7d574);color:#5b4406;font-weight:800;
 font-size:calc(var(--u) * 2.2);padding:calc(var(--u) * 1.4);transform:rotate(4deg);
 box-shadow:0 calc(var(--u) * 1.4) calc(var(--u) * 3) rgba(0,0,0,.4);border-radius:calc(var(--u) * .5);opacity:0}
.mug{position:relative;z-index:3;width:calc(var(--u) * 10);height:calc(var(--u) * 9.6);border-radius:calc(var(--u) * .8) calc(var(--u) * .8) calc(var(--u) * 2.6) calc(var(--u) * 2.6);
 background:linear-gradient(180deg,#33456a,#25334e);box-shadow:0 calc(var(--u) * 1) calc(var(--u) * 2) rgba(0,0,0,.4)}
.mug:after{content:"";position:absolute;right:calc(var(--u) * -2.4);top:calc(var(--u) * 1.6);width:calc(var(--u) * 2.8);height:calc(var(--u) * 3);
 border:calc(var(--u) * .7) solid #2e3f60;border-left:0;border-radius:0 calc(var(--u) * 2) calc(var(--u) * 2) 0}
.steam i{position:absolute;left:50%;bottom:calc(100% + var(--u) * .6);width:calc(var(--u) * .8);
 height:calc(var(--u) * 4);border-radius:99px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.30));opacity:0}
.pen{position:absolute;z-index:4;left:26%;bottom:calc(var(--u) * 5);width:calc(var(--u) * 12);height:calc(var(--u) * 1.1);
 border-radius:99px;background:linear-gradient(90deg,#e0453f 0 30%,#2b3550 30% 100%);transform:rotate(-24deg);
 box-shadow:0 calc(var(--u) * .8) calc(var(--u) * 1.6) rgba(0,0,0,.5)}
/* the clock is part of the desk, not a thing pinned to the stage: as a flow item
   it sits on the surface with the books and scales with them. Anchored to the
   stage it drifted towards the edge every time the fit grew the picture, and the
   fit then had to shrink the whole desk to keep it inside the safe box. */
.clock{position:relative;z-index:5;font-size:calc(var(--u) * 5);font-weight:800;
 color:#8ea0c2;font-variant-numeric:tabular-nums;letter-spacing:.02em;opacity:0}
.book{position:relative;z-index:3;width:calc(var(--u) * 34);height:calc(var(--u) * 40);border-radius:calc(var(--u) * .6);
 background:linear-gradient(180deg,#f2f5fb,#e3e9f5);box-shadow:0 calc(var(--u) * 2) calc(var(--u) * 4) rgba(0,0,0,.45);
 padding:calc(var(--u) * 2.4);display:flex;flex-direction:column;gap:calc(var(--u) * 1.6)}
.book .line{height:calc(var(--u) * 1.1);border-radius:99px;background:#2b3550;width:0}
.book .rule{height:calc(var(--u) * .5);border-radius:99px;background:#c3cddd}

/* --- scene: corridor (the head of department) --- */
/* --- scene: corridor (the head of department) ---
   Same story as the desk: width:100%;height:100% meant the wrapper measured as
   the whole stage, so the two figures (363x399 in a 1132 stage) could never be
   scaled up and sat in a 721px void. */
.corr{display:flex;align-items:flex-end;justify-content:center;
 gap:calc(var(--u) * 8);padding-bottom:calc(var(--u) * 4)}
.corr:before{content:"";position:absolute;inset:auto 0 0 0;height:62%;
 background:linear-gradient(180deg,rgba(79,140,255,.10),rgba(0,0,0,0));border-top:1px solid ${c.line}}
.fig{position:relative;width:calc(var(--u) * 17);height:calc(var(--u) * 52);opacity:0}
.fig .h{position:absolute;left:50%;top:0;transform:translateX(-50%);width:calc(var(--u) * 7.6);height:calc(var(--u) * 7.6);border-radius:50%;
 background:linear-gradient(180deg,#37507c,#25334e)}
.fig .b{position:absolute;left:50%;top:calc(var(--u) * 7.4);transform:translateX(-50%);width:calc(var(--u) * 12.8);height:calc(var(--u) * 30);
 border-radius:calc(var(--u) * 4) calc(var(--u) * 4) calc(var(--u) * 1) calc(var(--u) * 1);background:linear-gradient(180deg,#2b3c5e,#1d2740)}
.fig .lg{position:absolute;left:calc(50% - var(--u) * 6);top:calc(var(--u) * 34);width:calc(var(--u) * 4.2);height:calc(var(--u) * 16);
 border-radius:calc(var(--u) * 1);background:linear-gradient(180deg,#2b3c5e,#1d2740)}
.clip{position:absolute;right:calc(-1 * var(--u) * 5);top:calc(var(--u) * 20);width:calc(var(--u) * 11.5);height:calc(var(--u) * 15);
 background:linear-gradient(180deg,#f4b74a,#d99426);border-radius:calc(var(--u) * .6);transform:rotate(-8deg);opacity:0;
 box-shadow:0 calc(var(--u) * 1.4) calc(var(--u) * 3) rgba(0,0,0,.45)}
.clip u{display:block;height:calc(var(--u) * .7);background:#7a5510;margin:calc(var(--u) * 2) calc(var(--u) * 1.4) 0;border-radius:99px;opacity:.7}
.qmark{position:absolute;left:50%;top:calc(var(--u) * 34);transform:translateX(-50%);font-size:calc(var(--u) * 6);
 font-weight:800;color:rgba(148,163,196,.0);letter-spacing:.04em}

/* --- scene: laptop (the app writing questions) --- */
.lap{width:92%;max-width:calc(var(--u) * 78)}
.screen{background:linear-gradient(180deg,#0d1526,#0a1120);border:1px solid ${c.line};
 border-radius:calc(var(--u) * 2);padding:calc(var(--u) * 1.6);box-shadow:0 calc(var(--u) * 4) calc(var(--u) * 8) rgba(0,0,0,.5)}
.bar{display:flex;align-items:center;gap:calc(var(--u) * 1);margin-bottom:calc(var(--u) * 1.6)}
.bar i{width:calc(var(--u) * 1.2);height:calc(var(--u) * 1.2);border-radius:50%;background:#2c3a58;display:block}
.url{flex:1;height:calc(var(--u) * 3.4);border-radius:99px;background:#0e1730;border:1px solid #1d2b47;
 display:flex;align-items:center;padding:0 calc(var(--u) * 1.6);color:${c.muted};font-size:calc(var(--u) * 1.9);font-weight:600}
.app{padding:calc(var(--u) * 1.4) calc(var(--u) * 1.2) calc(var(--u) * .8)}
.appmark{font-size:calc(var(--u) * 3.2);font-weight:800;letter-spacing:-.02em;color:#fff}
.appmark b{background:${T.gradients.text};-webkit-background-clip:text;background-clip:text;color:transparent}
.inp{margin-top:calc(var(--u) * 1.4);height:calc(var(--u) * 6);border:calc(var(--u) * .22) solid rgba(79,140,255,.75);
 border-radius:calc(var(--u) * 1);background:#0b1224;display:flex;align-items:center;padding:0 calc(var(--u) * 1.8);
 font-size:calc(var(--u) * 2.5);color:#fff;font-weight:600;gap:calc(var(--u) * .3)}
.caret{width:calc(var(--u) * .22);height:calc(var(--u) * 3);background:${c.accent};display:block}
.q{margin-top:calc(var(--u) * 1.1);display:flex;gap:calc(var(--u) * 1.4);align-items:flex-start;
 background:#111a2e;border:1px solid #1e2b47;border-radius:calc(var(--u) * .9);padding:calc(var(--u) * 1.2) calc(var(--u) * 1.6);
 font-size:calc(var(--u) * 2.2);color:#cfe0ff;opacity:0}
.q b{color:${c.accent};font-weight:800}
.base{height:calc(var(--u) * 1.2);margin:0 auto;width:108%;border-radius:0 0 calc(var(--u) * 2) calc(var(--u) * 2);
 background:linear-gradient(180deg,#2a3550,#1b2436)}

/* --- scene: pupil phone ---
   It was 532x440 - wider than it was tall, i.e. not a phone, and only 36% of
   its stage. A phone is portrait: 40u wide with a body that runs to 58u, so it
   has a bezel and a lower third to fill instead of hugging its own text. */
.ph{position:relative;width:calc(var(--u) * 40);min-height:calc(var(--u) * 58);border-radius:calc(var(--u) * 4);
 background:linear-gradient(180deg,#0e1729,#0a1020);border:1px solid ${c.line};
 padding:calc(var(--u) * 2.2) calc(var(--u) * 1.8);box-shadow:0 calc(var(--u) * 4) calc(var(--u) * 9) rgba(0,0,0,.55)}
.ph:before{content:"";position:absolute;left:50%;top:calc(var(--u) * .8);transform:translateX(-50%);
 width:calc(var(--u) * 9);height:calc(var(--u) * 1);border-radius:99px;background:#1b2740}
.ph.tab{width:calc(var(--u) * 62);min-height:calc(var(--u) * 42);border-radius:calc(var(--u) * 3)}
.ph.tab:before{display:none}
.phtop{margin-top:calc(var(--u) * 1.6);color:${c.muted};font-size:calc(var(--u) * 1.8);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.phq{margin-top:calc(var(--u) * 1.2);font-size:calc(var(--u) * 2.9);font-weight:700;color:#fff;line-height:1.25}
.phbox{margin-top:calc(var(--u) * 1.8);min-height:calc(var(--u) * 11);border:calc(var(--u) * .2) solid #25324e;
 border-radius:calc(var(--u) * 1);background:#0b1224;padding:calc(var(--u) * 1.4);font-size:calc(var(--u) * 2.2);
 color:#fff;line-height:1.35;display:flex;flex-wrap:wrap;align-items:flex-start;gap:0 calc(var(--u) * .2)}
.phrow{margin-top:calc(var(--u) * 1.6);display:flex;align-items:center;gap:calc(var(--u) * 1.6)}
.micbtn{width:calc(var(--u) * 7.6);height:calc(var(--u) * 7.6);border-radius:50%;display:grid;place-items:center;
 background:#111a2e;border:1px solid #26344f;color:#cfe0ff}
.micbtn.rec{background:linear-gradient(96deg,${c.accent},${c.accent2});border-color:transparent;color:#fff;
 box-shadow:0 0 0 0 rgba(79,140,255,.55)}
.micbtn svg{width:calc(var(--u) * 3.6);height:calc(var(--u) * 3.6)}
.wave{display:flex;align-items:center;gap:calc(var(--u) * .5);height:calc(var(--u) * 5);flex:1}
.wave i{width:calc(var(--u) * .7);height:20%;border-radius:99px;background:rgba(79,140,255,.85);display:block}
.sent{margin-left:auto;color:${c.green};font-weight:800;font-size:calc(var(--u) * 2.1);opacity:0;display:flex;align-items:center;gap:calc(var(--u) * .8)}

/* --- scene: results (real class data) --- */
.res{width:96%;background:linear-gradient(180deg,#0d1526,#0a1120);border:1px solid ${c.line};
 border-radius:calc(var(--u) * 2);padding:calc(var(--u) * 2.2);box-shadow:0 calc(var(--u) * 4) calc(var(--u) * 9) rgba(0,0,0,.5)}
.rtop{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--u) * 1.4)}
.rtopic{font-size:calc(var(--u) * 2.8);font-weight:800;color:#fff}
.rsub{color:${c.muted};font-size:calc(var(--u) * 1.9);font-weight:600;margin-top:calc(var(--u) * .5)}
.rpct{font-size:calc(var(--u) * 2.6);font-weight:800;color:${c.muted};font-variant-numeric:tabular-nums}
.cols{display:flex;gap:calc(var(--u) * 1.4);margin-top:calc(var(--u) * 2);align-items:flex-start}
.col{flex:1;border-radius:calc(var(--u) * 1.2);padding:calc(var(--u) * 1.3) calc(var(--u) * 1.1);
 background:#101a2c;border:1px solid #1d2b47;opacity:0;border-top:calc(var(--u) * .7) solid}
.col.g{border-top-color:${c.green}}
.col.a{border-top-color:${c.amber}}
.col.r{border-top-color:${c.red}}
.cn{font-size:calc(var(--u) * 4.6);font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.col.g .cn{color:${c.green}}.col.a .cn{color:${c.amber}}.col.r .cn{color:${c.red}}
.cl{font-size:calc(var(--u) * 2.1);font-weight:800;color:#fff;margin-top:calc(var(--u) * .8)}
.ul{margin:calc(var(--u) * 1.2) 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:calc(var(--u) * .8)}
.chips{display:flex;flex-direction:column;gap:calc(var(--u) * 3);width:88%}
.chip{display:flex;align-items:center;gap:calc(var(--u) * 3);padding:calc(var(--u) * 2.6) calc(var(--u) * 3.4);border-radius:calc(var(--u) * 3);
 background:linear-gradient(180deg,#15213a,#0e172a);border:1px solid #2a3d63;box-shadow:0 calc(var(--u) * 1.5) calc(var(--u) * 4) rgba(0,0,0,.45);opacity:0}
.chip .av{width:calc(var(--u) * 8);height:calc(var(--u) * 8);border-radius:50%;display:grid;place-items:center;font-size:calc(var(--u) * 4);color:#fff;background:linear-gradient(135deg,#4f8cff,#7a5cff)}
.chip span{flex:1;font-size:calc(var(--u) * 5);font-weight:800;color:#fff}
.chip .ico{font-style:normal;display:grid;font-size:calc(var(--u) * 6.5);opacity:0}
.chips.qt .chip .av{background:linear-gradient(135deg,#3a4660,#28324a)}
.chips.qt .chip span{color:#e6ecf8}
.chips.qt .chip .ico{color:#6f7f9f;font-weight:900}
.ul li{border-radius:calc(var(--u) * .8);padding:calc(var(--u) * .15) calc(var(--u) * .7);transform-origin:left center;font-size:calc(var(--u) * 2.95);color:#d6e1f5;font-weight:700;opacity:0}
.rfoot{margin-top:calc(var(--u) * 1.8);color:${c.muted};font-size:calc(var(--u) * 1.8);font-weight:600;opacity:0}

/* --- scene: domain (the close) --- */
.dom{width:100%;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u) * 2.2)}
.dombrand{font-size:calc(var(--u) * 4);font-weight:800;color:${c.muted};letter-spacing:.01em;opacity:0}
.dombrand b{background:${T.gradients.text};-webkit-background-clip:text;background-clip:text;color:transparent}
.domtxt{font-size:calc(var(--u) * 8.2);font-weight:800;letter-spacing:-.03em;color:#fff;opacity:0;
 color:#fff;text-align:center;text-shadow:0 0 calc(var(--u) * 1.5) #000,0 0 calc(var(--u) * 4) #000,0 calc(var(--u) * .6) calc(var(--u) * 2) rgba(0,0,0,.9)}
.domsub{font-size:calc(var(--u) * 3.1);font-weight:700;color:#dfe8fb;opacity:0;text-align:center}
.domcta{opacity:0;margin-top:calc(var(--u) * 1.4);background:${T.gradients.brand};color:#fff;font-weight:800;
 padding:calc(var(--u) * 2) calc(var(--u) * 3.4);border-radius:999px;font-size:calc(var(--u) * 2.7);
 box-shadow:0 calc(var(--u) * 2) calc(var(--u) * 5) rgba(79,140,255,.4)}
`;
}

/* ---------------------------------------------------------------- helpers */
function rows(n, opts = {}) {
  /* This used to splice the class attribute and the data-attrs into one string
     with quote surgery, e.g. ' up" data-up="1'. A pupil that was BOTH up and
     dim (or up and hi, or up and alt) came out as data-up="1 dim", the selector
     .pup[data-up="1"] missed it, and that hand never went up. Built properly
     now. Arm side alternates so a row of raised hands is not five identical
     copies, and each arm is a slightly different length so the hands stop at
     different heights. */
  const AH = [11, 9.4, 10.5, 9.9, 11.3, 10.1, 9.7];
  return `<div class="rw" style="--s:${opts.s}">${Array.from({ length: n }, (_, i) => {
    const up = !!(opts.up && opts.up.includes(i));
    const dim = !!(opts.dim && opts.dim.includes(i));
    const hi = opts.hi === i;
    const alt = i % 2 === 1;
    const cls = ['pup', up && 'up', dim && 'dim', hi && 'hi', alt && 'alt'].filter(Boolean).join(' ');
    const attrs = [up && 'data-up="1"', hi && 'data-hi="1"', alt && 'data-side="l"'].filter(Boolean).join(' ');
    return `<i class="${cls}" ${attrs} style="--ah:${AH[i % AH.length]};--hd:${[6,5.6,6.3,5.8,6.1][i%5]};--sw:${[10,9.2,10.8,9.6,10.4][i%5]};--fb:${[-10,-4,-14,-6,-8][i%5]}deg;--sk:${['#f0cfa8','#c68a5c','#e6b98f','#8d5a3b','#f3d6b6'][i%5]};--hr:${['#2b1d14','#111111','#8a5a2b','#1a1410','#c79a52'][i%5]};--jp:${['#4a6898','#8a3b4e','#3d7b5a','#6a58a0','#9a7a33'][i%5]}">` +
      `<b class="hd"></b><s class="sh"></s><u class="arm"><i class="ua"></i><i class="fa"><b class="hand"></b></i></u></i>`;
  }).join('')}</div>`;
}

const QUESTIONS = (list) => list.map((q, i) => `<div class="q"><b>${i + 1}</b><span>${esc(q)}</span></div>`).join('');

/* ------------------------------------------------------------- the scenes */
const SCENES = {
  /* nothing but words: the on-screen text moves to the middle and goes big */
  text: () => ({ cap: 'center', html: '', paint: () => {} }),

  classroom: (b, cfg) => {
    /* dimAll: the room is dark except the pupils whose hands are up. That is the
       entire point of the "same five hands" beat, so it gets spelled out. */
    const nC = cfg.rowC || 6, nB = cfg.rowB || 7, nA = cfg.rowA || 8;
    const rest = (n, up) => Array.from({ length: n }, (_, i) => i).filter((i) => !(up || []).includes(i));
    const R = {
      cap: 'top',
      nod: cfg.nod ? 1 : 0,
      html: `<div class="cls">
      <div class="board"><span>${esc(cfg.board || '')}</span></div>
      <div class="rows">
        ${rows(nA, { s: 0.72, up: cfg.upBack || [], dim: cfg.dimAll ? rest(nA, cfg.upBack) : undefined })}
        ${rows(nB, { s: 0.88, up: cfg.upMid || [], dim: cfg.dimAll ? rest(nB, cfg.upMid) : cfg.dimMid, hi: cfg.hiMid })}
        ${rows(nC, { s: 1.06, up: cfg.up || [], dim: cfg.dimAll ? rest(nC, cfg.up) : cfg.dim, hi: cfg.hi })}<div class="deskband"></div>
      </div>
    </div>`,
    };
    R.paint = (function (root, p, t) {
      var qs = function (s) { return [].slice.call(root.querySelectorAll(s)); };
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      qs('.board').forEach(function (el) { el.style.opacity = e3((t - 0.1) / 0.5).toFixed(3); });
      qs('.rw').forEach(function (el, i) {
        var q = e3((t - 0.25 - i * 0.12) / 0.55);
        el.style.opacity = (0.55 + 0.45 * q).toFixed(3);
        el.style.transform = 'scale(calc(var(--s) * ' + (0.96 + 0.04 * q).toFixed(3) + '))';
      });
      qs('.pup[data-up="1"] .arm').forEach(function (arm, i) {
        /* varied finish angles and staggers: five hands up in a real room never
           stop at the same height or at the same moment */
        var q = e3((t - 0.62 - (i % 5) * 0.11) / 0.5);
        var end = -14 - (i % 3) * 7;
        arm.style.opacity = q.toFixed(3);
        arm.style.transform = 'rotate(' + (-150 + (end + 150) * q).toFixed(1) + 'deg)';
      });
      if (root.getAttribute('data-nod') === '1') {
        qs('.pup').forEach(function (el, i) {
          var a = Math.sin(t * 3.1 + i * 0.6) * 3.4 * e3((t - 0.5) / 0.9);
          el.querySelector('.hd').style.transform = 'translateX(-50%) translateY(' + a.toFixed(2) + 'px)';
        });
      }
      qs('.pup.hi').forEach(function (el) {
        var sc = 1 + Math.sin(t * 3.4) * 0.025 * e3((t - 1.1) / 0.6);
        el.style.transform = 'scale(' + sc.toFixed(4) + ')';
      });
    });
    return R;
  },

  desk: (b, cfg) => {
    /* A desk beat with no props drew an empty room - cover beat 5 and ninepm
       beat 3 were literally a bare tabletop and nothing else. Default to a
       normal marking desk instead. */
    if (!cfg.night && !cfg.day && !cfg.book && !cfg.papers && !cfg.books && !cfg.mug && !cfg.pen && !cfg.ticket && !cfg.clock) {
      cfg = Object.assign({ papers: 1, mug: 1, pen: 1, day: 1 }, cfg);
    }
    return {
      cap: 'top',
    html: `<div class="dk ${cfg.night ? 'night' : 'day'}">
      ${cfg.clock ? `<div class="clock">${esc(cfg.clock)}</div>` : ''}
      ${cfg.book ? `<div class="book">${Array.from({ length: 3 }, () => '<div class="rule"></div>').join('')}<div class="line"></div><div class="rule"></div><div class="rule"></div></div>` : ''}
      ${cfg.papers ? `<div class="sheet">
          ${Array.from({ length: 4 }, () => '<u></u>').join('')}
          <u class="short"></u>
          <div class="mark">✗</div><div class="mk2">✗</div>
        </div>` : ''}
      ${cfg.books ? `<div class="stack">${Array.from({ length: cfg.books }, (_, i) =>
        `<i style="--x:${((i % 3) - 1) * 1.6}%;--w:calc(var(--u) * ${26 + (i % 3) * 3})"></i>`).join('')}</div>` : ''}
      ${cfg.mug ? `<div class="mug"><div class="steam"><i></i><i></i><i></i></div></div>` : ''}
      ${cfg.pen ? '<div class="pen"></div>' : ''}
      ${cfg.ticket ? `<div class="sticky">mark<br>Thurs</div>` : ''}
    </div>`,
    paint: function (root, p, t) {
      var qs = function (s) { return [].slice.call(root.querySelectorAll(s)); };
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      qs('.stack i').forEach(function (el, i) {
        var q = e3((t - 0.15 - i * 0.06) / 0.45);
        el.style.opacity = q.toFixed(3);
        el.style.transform = 'translateX(var(--x)) translateY(' + ((1 - q) * -26).toFixed(1) + 'px)';
      });
      qs('.sheet,.book,.mug').forEach(function (el, i) {
        var q = e3((t - 0.2 - i * 0.1) / 0.5);
        el.style.opacity = q.toFixed(3);
        el.style.transform = 'translateY(' + ((1 - q) * 18).toFixed(1) + 'px)';
      });
      qs('.clock').forEach(function (el) {
        var q = e3((t - 0.5) / 0.5);
        el.style.opacity = (0.55 * q).toFixed(3);
      });
      qs('.mark').forEach(function (el) { var q = e3((t - 1.0) / 0.4); el.style.opacity = q.toFixed(3); el.style.transform = 'rotate(-9deg) scale(' + (1.5 - 0.5 * q).toFixed(3) + ')'; });
      qs('.mk2').forEach(function (el) { var q = e3((t - 1.5) / 0.4); el.style.opacity = q.toFixed(3); el.style.transform = 'rotate(-11deg) scale(' + (1.5 - 0.5 * q).toFixed(3) + ')'; });
      qs('.sticky').forEach(function (el) { el.style.opacity = e3((t - 0.7) / 0.45).toFixed(3); });
      qs('.steam i').forEach(function (el, i) {
        var s = (t * 0.5 + i * 0.33) % 1;
        el.style.opacity = (s < 0.15 || s > 0.9 ? 0 : 0.5 * Math.sin(s * Math.PI)).toFixed(3);
        el.style.transform = 'translateX(' + ((i - 1) * 4) + 'px) translateY(' + (-s * 26).toFixed(1) + 'px) scaleY(' + (0.7 + s * 0.5).toFixed(2) + ')';
      });
      qs('.book .line').forEach(function (el) { el.style.width = (e3((t - 1.1) / 0.9) * 46).toFixed(1) + '%'; });
      qs('.pen').forEach(function (el) {
        var q = e3((t - 0.6) / 0.6);
        el.style.opacity = q.toFixed(3);
        el.style.transform = 'rotate(-24deg) translateY(' + (Math.sin(t * 1.6) * 3).toFixed(1) + 'px)';
      });
      },
    };
  },

  corridor: (b, cfg) => ({
    cap: 'top',
    html: `<div class="corr">
      <div class="fig"><b class="h"></b><b class="b"></b>
        <div class="clip"><u></u><u style="width:70%"></u><u style="width:84%"></u><u style="width:52%"></u></div></div>
      <div class="fig"><b class="h"></b><b class="b"></b></div>
    </div>`,
    paint: function (root, p, t) {
      var qs = function (s) { return [].slice.call(root.querySelectorAll(s)); };
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      qs('.fig').forEach(function (el, i) {
        var q = e3((t - 0.15 - i * 0.16) / 0.55);
        el.style.opacity = q.toFixed(3);
        el.style.transform = 'translateY(' + ((1 - q) * 22).toFixed(1) + 'px)';
      });
      var clip = root.querySelector('.clip');
      if (clip) clip.style.opacity = e3((t - 0.7) / 0.45).toFixed(3);
      var qm = root.querySelector('.qmark');
      if (qm) { var q = e3((t - 1.2) / 0.5); qm.style.opacity = (q * 0.95).toFixed(3); qm.style.transform = 'translateX(-50%) translateY(' + ((1 - q) * 12).toFixed(1) + 'px)'; }
    },
  }),

  laptop: (b, cfg) => ({
    cap: 'top',
    typed: cfg.typed || '',
    html: `<div class="lap"><div class="screen">
      <div class="bar"><i></i><i></i><i></i><div class="url">dotheygetit.app</div></div>
      <div class="app">
        <div class="appmark">Get <b>It?</b></div>
        <div class="inp"><span class="typed"></span><i class="caret"></i></div>
        ${QUESTIONS(cfg.questions)}
      </div>
    </div><div class="base"></div></div>`,
    paint: function (root, p, t) {
      var qs = function (s) { return [].slice.call(root.querySelectorAll(s)); };
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      var typed = root.querySelector('.typed'), caret = root.querySelector('.caret');
      var full = root.getAttribute('data-typed') || '';
      /* the beat is as long as the voice, so the typing spans the beat rather
         than finishing in the first second and leaving a still picture */
      var n = Math.round(e3((p - 0.08) / 0.32) * full.length);
      if (typed) typed.textContent = full.slice(0, n);
      if (caret) caret.style.opacity = (n < full.length) ? (Math.sin(t * 9) > 0 ? 1 : 0.15) : (Math.sin(t * 4) > -0.3 ? 1 : 0);
      qs('.q').forEach(function (el, i) {
        var q = e3((p - (0.46 + i * 0.1)) / 0.16);
        el.style.opacity = q.toFixed(3);
        el.style.transform = 'translateY(' + ((1 - q) * 16).toFixed(1) + 'px)';
      });
    },
  }),

  phone: (b, cfg) => ({
    cap: 'top',
    typed: cfg.answer || '',
    mode: cfg.mode || 'speak',
    html: `<div class="ph${cfg.tab ? ' tab' : ''}">
      <div class="phtop">Question 1 of 4</div>
      <div class="phq">${esc(cfg.q || '')}</div>
      <div class="phbox"><span class="typed"></span><i class="caret"></i></div>
      <div class="phrow">
        <div class="micbtn${cfg.mode === 'speak' ? ' rec" data-rec="1' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>
        </div>
        <div class="wave">${Array.from({ length: 14 }, () => '<i></i>').join('')}</div>
        <div class="sent">✓ Sent</div>
      </div>
    </div>`,
    paint: function (root, p, t) {
      var qs = function (s) { return [].slice.call(root.querySelectorAll(s)); };
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      var typing = root.getAttribute('data-mode') !== 'speak';
      var typed = root.querySelector('.typed'), caret = root.querySelector('.caret');
      var full = root.getAttribute('data-typed') || '';
      var mic = root.querySelector('.micbtn');
      /* the phone itself */
      var rise = e3((t - 0.1) / 0.5);
      root.querySelector('.ph').style.opacity = rise.toFixed(3);
      root.querySelector('.ph').style.transform = 'translateY(' + ((1 - rise) * 24).toFixed(1) + 'px)';

      if (typing) {
        var n = Math.round(e3((p - 0.22) / 0.42) * full.length);
        if (typed) typed.textContent = full.slice(0, n);
        if (caret) caret.style.opacity = (n < full.length) ? (Math.sin(t * 9) > 0 ? 1 : 0.15) : 1;
      } else {
        /* the mic breathes, the bars move, then the words land as text -
           spread across the beat, because the voice is still speaking */
        var on = e3((p - 0.08) / 0.16);
        if (mic) {
          mic.style.boxShadow = '0 0 0 ' + (on * 14 * (0.5 + 0.5 * Math.sin(t * 5))).toFixed(1) + 'px rgba(79,140,255,.18)';
          mic.style.transform = 'scale(' + (1 + on * 0.05 * (0.5 + 0.5 * Math.sin(t * 5))).toFixed(4) + ')';
        }
        qs('.wave i').forEach(function (el, i) {
          var s = Math.abs(Math.sin(t * 6 + i * 0.9));
          var amp = clamp((1 - (p - 0.1) / 0.6)) * 0.9 + 0.1;
          el.style.height = (20 + s * 70 * amp).toFixed(1) + '%';
        });
        var n2 = Math.round(e3((p - 0.26) / 0.5) * full.length);
        if (typed) typed.textContent = full.slice(0, n2);
        var done = e3((p - 0.82) / 0.14);
        qs('.sent').forEach(function (el) { el.style.opacity = done.toFixed(3); });
        qs('.wave').forEach(function (el) { el.style.opacity = (1 - done * 0.85).toFixed(3); });
      }
      qs('.phq').forEach(function (el) {
        var q = e3((t - 0.3) / 0.5);
        el.style.opacity = (0.35 + 0.65 * q).toFixed(3);
      });
    },
  }),

  chips: (b, cfg) => ({
    cap: 'top',
    html: `<div class="chips${cfg.quiet ? ' qt' : ''}">${(cfg.chips || []).map((n) => `<div class="chip"><b class="av">${esc(n[0])}</b><span>${esc(n)}</span><i class="ico">${cfg.quiet && !cfg.icon ? '···' : '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#7fb0ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (CHIP_ICONS[cfg.icon] || CHIP_ICONS.hand) + '</svg>'}</i></div>`).join('')}</div>`,
    paint: function (root, p, t) {
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      var ch = [].slice.call(root.querySelectorAll('.chip'));
      var qt = !!root.querySelector('.chips.qt');
      /* one card per spoken name: names are spaced through the line */
      ch.forEach(function (el, i) {
        var at = ch.length === 1 ? 0.12 : 0.28 + i * 0.2;
        var q = qt ? e3((p - at) / 0.12) : 1; var nm = e3((p - at) / 0.1); el.querySelector('span').style.opacity = nm.toFixed(3); el.querySelector('.av').style.opacity = (0.35 + 0.65 * nm).toFixed(3);
        el.style.opacity = (qt ? q * (1 - 0.45 * e3((p - 0.55) / 0.3)) : q).toFixed(3);
        el.style.transform = 'translateY(' + ((1 - q) * 40).toFixed(1) + 'px) scale(' + (0.9 + 0.1 * q).toFixed(3) + ')';
        var ico = el.querySelector('.ico');
        var h = qt ? e3((p - at - 0.06) / 0.1) : 1;
        ico.style.transform = 'translateY(' + ((1 - h) * 30).toFixed(1) + 'px) rotate(' + (qt ? 0 : Math.sin(t * 7 + i) * 8 * h).toFixed(1) + 'deg)';
        ico.style.opacity = h.toFixed(3);
      });
    },
  }),

  results: (b, cfg) => ({
    cap: 'top',
    html: `<div class="res">
      <div class="rtop">
        <div><div class="rtopic">${esc(cfg.topic || '')}</div><div class="rsub">${esc(cfg.sub || '')}</div></div>
        <div class="rpct">2 min</div>
      </div>
      <div class="cols">
        ${[['g', cfg.g], ['a', cfg.a], ['r', cfg.r]].map(([k, col]) => `
          <div class="col ${k}">
            <div class="cn" data-to="${col.count}">0</div>
            <div class="cl">${esc(col.label)}</div>
            <ul class="ul">${col.names.map((n) => `<li${(cfg.hl || []).includes(n) ? ' class="hl" data-k="' + k + '"' : ''}>${esc(n)}</li>`).join('')}</ul>
          </div>`).join('')}
      </div>
      <div class="rfoot">${esc(cfg.foot || '')}</div>
    </div>`,
    paint: function (root, p, t) {
      var qs = function (s) { return [].slice.call(root.querySelectorAll(s)); };
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      qs('.col').forEach(function (el, i) {
        var q = e3((t - 0.15 - i * 0.14) / 0.5);
        el.style.opacity = q.toFixed(3);
        el.style.transform = 'translateY(' + ((1 - q) * 20).toFixed(1) + 'px)';
      });
      qs('.cn').forEach(function (el, i) {
        var to = +el.getAttribute('data-to');
        var q = e3((t - 0.45 - i * 0.14) / 0.7);
        el.textContent = Math.round(to * q);
      });
      /* the names keep arriving for the length of the beat: the list is the
         point of the screen, and it gives a long beat something to watch */
      var per = 0.44 / 8;
      qs('.ul li').forEach(function (el, i) {
        var col = Math.floor(i / 8), j = i % 8;
        el.style.opacity = e3((p - 0.36 - col * 0.05 - j * per) / 0.14).toFixed(3);
      });
      /* highlights land in the order the voice says them */
      qs('.ul li.hl').forEach(function (el, i) {
        var h = e3((p - 0.25 - i * 0.22) / 0.1);
        var k = el.getAttribute('data-k');
        var col = k === 'g' ? '46,204,113' : k === 'r' ? '255,92,92' : '255,196,61';
        el.style.opacity = Math.max(+el.style.opacity, h).toFixed(3);
        el.style.background = 'rgba(' + col + ',' + (0.28 * h).toFixed(3) + ')';
        el.style.boxShadow = '0 0 0 ' + (3 * h).toFixed(1) + 'px rgba(' + col + ',' + (0.9 * h).toFixed(3) + ')';
        el.style.color = h > 0.5 ? '#fff' : '';
        el.style.transform = 'scale(' + (1 + 0.12 * h).toFixed(3) + ')';
      });
      qs('.rfoot').forEach(function (el, i) {
        var i2 = [].slice.call(root.querySelectorAll('.rfoot')).indexOf(el);
        el.style.opacity = e3((p - 0.88 - i2 * 0.03) / 0.1).toFixed(3);
        el.style.transform = 'translateY(' + ((1 - e3((p - 0.88) / 0.1)) * 10).toFixed(1) + 'px)';
      });
    },
  }),

  domain: (b, cfg) => ({
    cap: 'none',
    html: `<div class="dom">
      <div class="dombrand">Get <b>It?</b></div>
      <div class="domtxt">dotheygetit.app</div>
      ${cfg.min ? '' : `<div class="domsub">${esc(cfg.sub || 'Free. Nothing to install.')}</div>`}
      <div class="domcta">Try it free →</div>
    </div>`,
    paint: function (root, p, t) {
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      /* a slow push, so the close is never completely still */
      var dom = root.querySelector('.dom');
      if (dom) dom.style.transform = 'scale(' + (1 + 0.03 * p).toFixed(4) + ')';
      [['.dombrand', 0.05], ['.domtxt', 0.18], ['.domsub', 0.42], ['.domcta', 0.6]].forEach(function (pair, i) {
        var el = root.querySelector(pair[0]);
        if (!el) return;
        var q = e3((t - pair[1]) / 0.55);
        el.style.opacity = q.toFixed(3);
        el.style.transform = 'translateY(' + ((1 - q) * (i === 1 ? 22 : 14)).toFixed(1) + 'px) scale(' + (i === 1 ? (0.955 + 0.045 * q).toFixed(4) : 1) + ')';
      });
    },
  }),
};

/* Which scene draws this beat? Ordered rules against the script's own words. */
function pick(beat, cfg) {
  const on = String(beat.onscreen || '').toLowerCase();
  const txt = (beat.visual + ' ' + beat.onscreen).toLowerCase();
  if (/dotheygetit\.app/.test(on)) return 'domain';  if (/three columns|three groups|three labelled|results screen|sorted into three|split into three/.test(txt)) return 'results';
  /* "type a topic" beats often mention the pupil's phone in the same breath,
     but the beat is about the teacher's screen - so the laptop wins here. */
  if (/type a topic|a single box|single text box|into a box|into the get it\? box/.test(txt)) return 'laptop';
  if (/corridor|clipboard/.test(txt)) return 'corridor';
  if (/classroom|hands? up|whiteboard|cover slip|rows of pupils|thirty pupils|same shot|year 8 boy|isn't moving/.test(txt)) return 'classroom';
  /* a bare "desk" or "books" is often just scenery behind a phone, so only
     these firmer phrases count as a desk beat */
  if (/teacher's desk|kitchen table|exercise books|open book|pile of exercise|mock papers|exit.ticket/.test(txt)) return 'desk';
  if (/phone/.test(txt)) return 'phone';
  if (/laptop/.test(txt)) return 'laptop';
  return 'text';
}

const CAP = (s) => String(s).replace(/^\s+|\s+$/g, '').replace(/\.\s+/g, '. | ');
function split(onscreen) {
  const parts = CAP(onscreen).split('|');
  return { l1: parts[0] || '', l2: parts.slice(1).join(' ').trim() };
}

module.exports = { css, SCENES, pick, split, esc };
