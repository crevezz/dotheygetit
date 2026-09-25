/* replace the pupil anatomy block (straight bars -> two-segment arm with an
   elbow) and add the desk band, without matching long comment text by hand */
const fs = require('fs');
const F = 'scenes.js';
let s = fs.readFileSync(F, 'utf8');

const NEW = `.pup{position:relative;width:calc(var(--u) * 9);height:calc(var(--u) * 15);display:block}
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
.up{position:absolute;inset:0;border-radius:calc(var(--u) * 1.25);
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
`;

const a = s.indexOf('.pup{position:relative');
const b = s.indexOf('.pup.dim .hd{');
if (a < 0 || b < 0 || b < a) throw new Error('pupil block not found: ' + a + ' ' + b);
s = s.slice(0, a) + NEW + '\n' + s.slice(b);

/* desk edge in front of the front row */
const DESK = `
.deskband{width:100%;height:calc(var(--u) * 4.4);margin-top:calc(var(--u) * -2.8);
 border-radius:calc(var(--u) * 1.2) calc(var(--u) * 1.2) calc(var(--u) * .5) calc(var(--u) * .5);
 background:linear-gradient(180deg,#3b4d74,#26334e);border-top:calc(var(--u) * .35) solid #55709f;
 box-shadow:0 calc(var(--u) * 2) calc(var(--u) * 5) rgba(0,0,0,.5)}
`;
const anchor = 'transform:scale(var(--s));opacity:0}';
const i = s.indexOf(anchor);
if (i < 0) throw new Error('row anchor not found');
s = s.slice(0, i + anchor.length) + DESK + s.slice(i + anchor.length);

fs.writeFileSync(F, s);
console.log('pupil block replaced, deskband css added, ' + s.split('\n').length + ' lines');