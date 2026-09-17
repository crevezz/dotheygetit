const fs = require('fs');
const log = [], ok = (n, c) => log.push((c ? 'ok   ' : 'FAIL ') + n);

/* ---------------- server: one endpoint, posts it to Discord ---------------- */
let s = fs.readFileSync('server.js', 'utf8');
if (!s.includes("'/api/feedback'")) {
  const anchor = "    if (p === '/api/signup' && req.method === 'POST') {";
  const route = `    if (p === '/api/feedback' && req.method === 'POST') {
      const b = await readBody(req);
      const msg = String(b.message || '').trim().slice(0, 1200);
      if (!msg) return sendErr(res, 'Tell me what happened first.');
      const tok = String(process.env.DISCORD_TOKEN || '').trim();
      const chan = String(process.env.FEEDBACK_CHANNEL || '').trim();
      const m = (req.headers.cookie || '').match(/sid=([A-Za-z0-9]+)/);
      const tid = m && store.tokens[m[1]];
      const t = tid && store.teachers.find(x => x.id === tid);
      const who = t ? t.email : 'not logged in';
      if (tok && chan) {
        const body = { embeds: [{
          title: 'Feedback from the app',
          description: msg,
          color: 0x4f8cff,
          fields: [
            { name: 'Page', value: String(b.page || 'unknown').slice(0, 200), inline: true },
            { name: 'Who', value: String(who).slice(0, 200), inline: true },
            { name: 'Browser', value: (String(b.ua || 'unknown').slice(0, 300)) },
          ],
        }] };
        try {
          await fetch('https://discord.com/api/v10/channels/' + chan + '/messages', {
            method: 'POST',
            headers: { Authorization: 'Bot ' + tok, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        } catch (e) { /* never let this break the person sending it */ }
      }
      return sendJson(res, { ok: true });
    }

` + anchor;
  s = s.replace(anchor, route);
  ok('server: /api/feedback -> Discord', true);
} else ok('server: /api/feedback -> Discord', true);
fs.writeFileSync('server.js', s);

/* ---------------- page: the box, in the teachers' tab only ---------------- */
let h = fs.readFileSync('public/index.html', 'utf8');
if (!h.includes('fbOpen')) {
  const anchor = '    <p class="sitenote" style="text-align:center;margin-top:20px">';
  const block = `    <p class="sitenote" style="text-align:center;margin-top:16px">
      Something broken, or a lesson it got wrong? <a href="#" id="fbOpen">Tell me what happened</a>
      &middot; or ask in the <a href="https://discord.gg/Vs9Dect2VK" target="_blank" rel="noopener">support server</a>.
    </p>
    <div id="fbBox" class="hidden">
      <textarea id="fbMsg" placeholder="What happened? And what did you expect instead?"></textarea>
      <button id="fbSend" class="ghost" style="align-self:flex-start">Send it</button>
    </div>

` + anchor;
  if (h.includes(anchor)) { h = h.replace(anchor, block); ok('page: the box is there (teachers only)', true); }
  else ok('page: the box is there (teachers only)', false);
} else ok('page: the box is there (teachers only)', true);
fs.writeFileSync('public/index.html', h);

/* ---------------- client: open, send, say thank you ---------------- */
let a = fs.readFileSync('public/app.js', 'utf8');
if (!a.includes('fbOpen')) {
  const anchor = `$('#btnLogout').addEventListener('click', async () => {`;
  const code = `/* --- feedback: goes straight to a private Discord channel, with the detail already attached --- */
const fbOpen = document.getElementById('fbOpen');
if (fbOpen) fbOpen.addEventListener('click', (e) => {
  e.preventDefault();
  const box = document.getElementById('fbBox');
  box.classList.toggle('hidden');
  if (!box.classList.contains('hidden')) document.getElementById('fbMsg').focus();
});
const fbSend = document.getElementById('fbSend');
if (fbSend) fbSend.addEventListener('click', async () => {
  const box = document.getElementById('fbBox');
  const msg = document.getElementById('fbMsg').value.trim();
  if (!msg) return document.getElementById('fbMsg').focus();
  fbSend.disabled = true;
  fbSend.textContent = 'Sending...';
  try {
    await post('/api/feedback', { message: msg, page: location.pathname + location.hash, ua: navigator.userAgent });
    document.getElementById('fbMsg').value = '';
    fbSend.textContent = 'Thank you';
    setTimeout(() => { box.classList.add('hidden'); fbSend.textContent = 'Send it'; fbSend.disabled = false; }, 2400);
  } catch (err) {
    fbSend.textContent = 'That did not send - try again';
    fbSend.disabled = false;
  }
});

` + anchor;
  if (a.includes(anchor)) { a = a.replace(anchor, code); ok('client: open + send', true); }
  else ok('client: open + send', false);
} else ok('client: open + send', true);
fs.writeFileSync('public/app.js', a);

/* ---------------- a bit of styling so it does not look bolted on ---------------- */
let c = fs.readFileSync('public/styles.css', 'utf8');
if (!c.includes('#fbBox')) {
  c += `
#fbBox{margin:10px auto 0;max-width:520px;display:flex;flex-direction:column;gap:8px}
#fbBox textarea{width:100%;min-height:84px;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit;font-size:14px;resize:vertical}
#fbBox textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
`;
  ok('styles added', true);
} else ok('styles added', true);
fs.writeFileSync('public/styles.css', c);

console.log(log.join('\n'));
