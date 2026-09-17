const fs = require('fs');
const log = [];
const ok = (n, c) => log.push((c ? 'ok   ' : 'FAIL ') + n);

/* ---------- server: only someone with the code can make an account ---------- */
let s = fs.readFileSync('server.js', 'utf8');
const signupAnchor = "      if (!email || !email.includes('@')) return sendErr(res, 'Please enter a valid email.');";
if (s.includes(signupAnchor) && !s.includes('SIGNUP_CODE')) {
  const gate = signupAnchor + `
      const needCode = String(process.env.SIGNUP_CODE || '').trim();
      if (needCode && String(b.invite || '').trim() !== needCode) {
        return sendErr(res, 'This app is invite-only while it is being tested. Ask for the code.');
      }`;
  s = s.replace(signupAnchor, gate);
  ok('signup needs the invite code', true);
} else ok('signup needs the invite code', s.includes('SIGNUP_CODE'));

/* tell the page whether to show the field at all */
if (!s.includes("'/api/gate'")) {
  const anchor = "    if (p === '/api/signup' && req.method === 'POST') {";
  s = s.replace(anchor, `    if (p === '/api/gate' && req.method === 'GET') {
      return sendJson(res, { inviteRequired: !!String(process.env.SIGNUP_CODE || '').trim() });
    }

` + anchor);
  ok('/api/gate reports whether a code is needed', true);
} else ok('/api/gate reports whether a code is needed', s.includes("'/api/gate'"));
fs.writeFileSync('server.js', s);

/* ---------- page: the field, hidden unless the server says it is needed ---------- */
let h = fs.readFileSync('public/index.html', 'utf8');
if (!h.includes('authInvite')) {
  const pw = /<input id="authPass"[^>]*\/>/;
  const m = h.match(pw);
  if (m) {
    h = h.replace(m[0], m[0] + `
      <input id="authInvite" type="password" placeholder="Invite code" autocomplete="off" style="display:none"/>`);
    ok('invite field added (hidden by default)', true);
  } else ok('invite field added (hidden by default)', false);
} else ok('invite field added (hidden by default)', h.includes('authInvite'));
fs.writeFileSync('public/index.html', h);

/* ---------- client: send it, and reveal the field when it is on ---------- */
let a = fs.readFileSync('public/app.js', 'utf8');
if (!a.includes('authInvite')) {
  const before = `  try {
    await post(path, { email, password });`;
  const after = `  const inv = document.getElementById('authInvite');
  const invite = inv ? inv.value.trim() : '';
  try {
    await post(path, { email, password, invite });`;
  if (a.includes(before)) { a = a.replace(before, after); ok('client sends the code', true); } else ok('client sends the code', false);

  const boot = `$('#btnLogout').addEventListener('click', async () => {`;
  const gate = `/* invite-only gate: show the field only when the server is asking for one */
fetch('/api/gate').then(r => r.json()).then(g => {
  const el = document.getElementById('authInvite');
  if (el && g && g.inviteRequired) el.style.display = '';
}).catch(() => {});

` + boot;
  if (a.includes(boot)) { a = a.replace(boot, gate); ok('client reveals the field when needed', true); } else ok('client reveals the field when needed', false);
} else ok('client already patched', true);
fs.writeFileSync('public/app.js', a);

console.log(log.join('\n'));
