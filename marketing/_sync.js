/* app-first, VO-locked rebuild of the quiet ad */
const fs = require('fs');
const D = __dirname;
const rep = (c, a, b) => { if (!c.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); return c.replace(a, b); };

/* 1. script: every line says what is on screen */
const script = {
  id: 'quiet', angle: 'Same few hands; the quiet ones go unheard; private answers show who really gets it.', total_seconds: 20,
  beats: [
    { seconds: 3, onscreen: 'Hands up. Always them.', vo: 'Same three hands. Ellie. Sam. Noah.', visual: 'chips: three name cards pop up with hands, in time with each name' },
    { seconds: 3, onscreen: 'The answer nobody heard.', vo: 'Maya knows. She never says it.', visual: 'chips: one quiet card, Maya, silent' },
    { seconds: 4, onscreen: 'Asked privately. All at once.', vo: 'So Get It? sends your questions to every phone.', visual: 'laptop: teacher types the water cycle, four questions appear' },
    { seconds: 3, onscreen: 'Right. Unseen until now.', vo: 'Maya types: the droplets get too heavy.', visual: 'phone: Maya types the answer' },
    { seconds: 4, onscreen: "Not who you'd guess.", vo: 'Maya got it. Noah needs help.', visual: 'results screen, Maya lit under Got it, then Noah under Needs help' },
    { seconds: 3, onscreen: 'dotheygetit.app', vo: 'Hear the whole room. dotheygetit dot app.', visual: 'end card' },
  ],
};
fs.writeFileSync(D + '/scripts/quiet.json', JSON.stringify(script, null, 2));

/* 2. config: scenes per beat, names that match the VO, highlights */
let c = fs.readFileSync(D + '/beats.config.js', 'utf8');
c = c.replace("\n  quiet: { 0: 'results' },", '');
c = rep(c, "speak: { 0: 'desk' },", "speak: { 0: 'desk' },\n  quiet: { 0: 'chips', 1: 'chips', 2: 'laptop', 3: 'phone', 4: 'results', 5: 'domain' },");
c = rep(c, 'quiet: { 0: { up: [0, 1, 2, 3, 4], dimAll: 1 } },',
  "quiet: { 0: { chips: ['Ellie', 'Sam', 'Noah'], hand: 1 }, 1: { chips: ['Maya'], quiet: 1 }, 3: { q: 'Why does it eventually rain?', answer: 'The droplets get too heavy.', mode: 'type' }, 4: { hl: ['Maya', 'Noah'] } },");
c = rep(c, "resFoot: 'The ones who never put a hand up answered.',",
  "resFoot: 'The ones who never put a hand up answered.',\n    names: { g: ['Maya', 'Ellie', 'Isla', 'Omar', 'Kai', 'Priya', 'Jonah', 'Iris'], a: ['Sam', 'Layla', 'Callum', 'Idris', 'Elsie', 'Nia', 'Leon'], r: ['Noah', 'Sofia', 'Grace', 'Tyler', 'Freya', 'Rhys', 'Dylan', 'Aisha'] },");
c = rep(c, 'names: RES[key].names.slice(0, Math.min(8, count)) }', 'names: ((c.names && c.names[key]) || RES[key].names).slice(0, Math.min(8, count)) }');
fs.writeFileSync(D + '/beats.config.js', c);

/* 3. scenes: chips scene + results highlight */
let s = fs.readFileSync(D + '/scenes.js', 'utf8');
if (!s.includes('chips: (b, cfg)')) {
  s = rep(s, '  results: (b, cfg) => ({', `  chips: (b, cfg) => ({
    cap: 'top',
    html: \`<div class="chips\${cfg.quiet ? ' qt' : ''}">\${(cfg.chips || []).map((n) => \`<div class="chip"><b class="av">\${esc(n[0])}</b><span>\${esc(n)}</span><i class="ico">\${cfg.quiet ? '···' : '✋'}</i></div>\`).join('')}</div>\`,
    paint: function (root, p, t) {
      var e3 = function (q) { q = clamp(q); return 1 - Math.pow(1 - q, 3); };
      var ch = [].slice.call(root.querySelectorAll('.chip'));
      var qt = !!root.querySelector('.chips.qt');
      /* one card per spoken name: names are spaced through the line */
      ch.forEach(function (el, i) {
        var at = ch.length === 1 ? 0.12 : 0.28 + i * 0.2;
        var q = e3((p - at) / 0.12);
        el.style.opacity = (qt ? q * (1 - 0.45 * e3((p - 0.55) / 0.3)) : q).toFixed(3);
        el.style.transform = 'translateY(' + ((1 - q) * 40).toFixed(1) + 'px) scale(' + (0.9 + 0.1 * q).toFixed(3) + ')';
        var ico = el.querySelector('.ico');
        var h = e3((p - at - 0.06) / 0.1);
        ico.style.transform = 'translateY(' + ((1 - h) * 30).toFixed(1) + 'px) rotate(' + (qt ? 0 : Math.sin(t * 7 + i) * 8 * h).toFixed(1) + 'deg)';
        ico.style.opacity = h.toFixed(3);
      });
    },
  }),

  results: (b, cfg) => ({`);
  s = rep(s, "<ul class=\"ul\">${col.names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>",
    "<ul class=\"ul\">${col.names.map((n) => `<li${(cfg.hl || []).includes(n) ? ' class=\"hl\" data-k=\"' + k + '\"' : ''}>${esc(n)}</li>`).join('')}</ul>");
  s = rep(s, "      qs('.rfoot').forEach(function (el, i) {", `      /* highlights land in the order the voice says them */
      qs('.ul li.hl').forEach(function (el, i) {
        var h = e3((p - 0.3 - i * 0.28) / 0.12);
        var k = el.getAttribute('data-k');
        var col = k === 'g' ? '46,204,113' : k === 'r' ? '255,92,92' : '255,196,61';
        el.style.opacity = Math.max(+el.style.opacity, h).toFixed(3);
        el.style.background = 'rgba(' + col + ',' + (0.28 * h).toFixed(3) + ')';
        el.style.boxShadow = '0 0 0 ' + (3 * h).toFixed(1) + 'px rgba(' + col + ',' + (0.9 * h).toFixed(3) + ')';
        el.style.color = h > 0.5 ? '#fff' : '';
        el.style.transform = 'scale(' + (1 + 0.12 * h).toFixed(3) + ')';
      });
      qs('.rfoot').forEach(function (el, i) {`);
  s = rep(s, '.ul li{', `.chips{display:flex;flex-direction:column;gap:calc(var(--u) * 3);width:88%}
.chip{display:flex;align-items:center;gap:calc(var(--u) * 3);padding:calc(var(--u) * 2.6) calc(var(--u) * 3.4);border-radius:calc(var(--u) * 3);
 background:linear-gradient(180deg,#15213a,#0e172a);border:1px solid #2a3d63;box-shadow:0 calc(var(--u) * 1.5) calc(var(--u) * 4) rgba(0,0,0,.45);opacity:0}
.chip .av{width:calc(var(--u) * 8);height:calc(var(--u) * 8);border-radius:50%;display:grid;place-items:center;font-size:calc(var(--u) * 4);color:#fff;background:linear-gradient(135deg,#4f8cff,#7a5cff)}
.chip span{flex:1;font-size:calc(var(--u) * 5);font-weight:800;color:#fff}
.chip .ico{font-style:normal;font-size:calc(var(--u) * 6.5);opacity:0}
.chips.qt .chip .av{background:linear-gradient(135deg,#3a4660,#28324a)}
.chips.qt .chip span{color:#9fb0cf}
.chips.qt .chip .ico{color:#6f7f9f;font-weight:900}
.ul li{border-radius:calc(var(--u) * .8);padding:0 calc(var(--u) * .8);transform-origin:left center;`);
}
fs.writeFileSync(D + '/scenes.js', s);

/* 4. motion cut: only a small head start, so the first name still lands on the word */
let f = fs.readFileSync(D + '/beat-film.js', 'utf8');
f = f.replace('POSTER === 2) ? t + 1.2 : t;', 'POSTER === 2) ? t + 0.3 : t;');
fs.writeFileSync(D + '/beat-film.js', f);
console.log('synced');
