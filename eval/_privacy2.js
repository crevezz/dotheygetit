// privacy page colours for the dark theme + consent tick on the pupil join screen
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..');

/* ---- privacy page: it was written with light-mode colours, so the box text vanished ---- */
let p = fs.readFileSync(path.join(R, 'public', 'privacy.html'), 'utf8');
const s1 = p.indexOf('<style>');
const s2 = p.indexOf('</style>');
if (s1 < 0 || s2 < 0) { console.error('MISS style'); process.exit(1); }
p = p.slice(0, s1) + `<style>
  .priv { max-width: 720px; margin: 0 auto; padding: 26px 20px 70px; }
  .priv h1 { font-size: 27px; margin: 0 0 4px; }
  .priv h2 { font-size: 17px; margin: 28px 0 6px; color: var(--accent); }
  .priv p, .priv li { line-height: 1.6; }
  .priv li { margin: 4px 0; }
  .priv .sub { color: var(--muted); margin: 0 0 20px; }
  .priv .back { display: inline-block; margin-bottom: 16px; font-size: 14px; color: var(--accent); text-decoration: none; }
  .priv .back:hover { text-decoration: underline; }
  .priv a { color: var(--accent); }
  /* the box is a card of its own, in the app's own colours - a light panel on this dark
     page left the text invisible */
  .priv .box { border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 18px; background: var(--surface); color: var(--text); }
  .priv .box p { margin: 0; }
  .priv code { background: var(--surface2); color: var(--text); padding: 1px 6px; border-radius: 6px; }
</style>` + p.slice(s2);
fs.writeFileSync(path.join(R, 'public', 'privacy.html'), p);

/* ---- consent tick, above the Start button ---- */
let h = fs.readFileSync(path.join(R, 'public', 'index.html'), 'utf8');
const btn = '<button id="btnJoin" class="primary wide"';
if (!h.includes(btn)) { console.error('MISS btnJoin'); process.exit(1); }
if (!h.includes('id="consent"')) {
  h = h.replace(btn, `<label class="consent"><input type="checkbox" id="consent"/> I understand my answers go to my teacher, and to an AI that helps them read them. <a href="/privacy" target="_blank" rel="noopener">Privacy</a></label>\r\n      ` + btn);
}
fs.writeFileSync(path.join(R, 'public', 'index.html'), h);

/* ---- gate the join on it ---- */
let a = fs.readFileSync(path.join(R, 'public', 'app.js'), 'utf8');
const gateAnchor = "$('#btnJoin').addEventListener('click', async () => {\n  setMsg($('#joinMsg'), '');";
const gate = `$('#btnJoin').addEventListener('click', async () => {
  setMsg($('#joinMsg'), '');
  /* Nothing is sent anywhere until the pupil has said they understand where their answers
     go. The tick is what turns a privacy notice into agreement. */
  const tick = document.getElementById('consent');
  if (tick && !tick.checked) return setMsg($('#joinMsg'), 'Please tick the box above first.');`;
if (!a.includes(gateAnchor)) { console.error('MISS gate'); process.exit(1); }
a = a.replace(gateAnchor, gate);
fs.writeFileSync(path.join(R, 'public', 'app.js'), a);

/* ---- consent box styling ---- */
let c = fs.readFileSync(path.join(R, 'public', 'styles.css'), 'utf8');
if (!c.includes('.consent')) {
  c += `\r\n/* the pupil has to see where their answers go before anything is sent */\r\n.consent{ display:flex; gap:8px; align-items:flex-start; font-size:12.5px; color:var(--muted); margin:10px 0 12px; line-height:1.5; cursor:pointer }\r\n.consent input{ margin-top:2px; width:16px; height:16px; accent-color:var(--accent); flex:0 0 auto }\r\n.consent a{ color:var(--accent) }\r\n`;
  fs.writeFileSync(path.join(R, 'public', 'styles.css'), c);
}
console.log('done: privacy colours, consent tick, gate');
