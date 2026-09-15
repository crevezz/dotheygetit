// Understanding Check - zero-dependency Node server
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const qrcode = require('qrcode');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data.json');
const CLOSING = 'Great — that is everything I needed. Thank you for thinking it through!';

// ------------------------------------------------------------------- config
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); }
  catch { return {}; }
}
const cfg = Object.assign({ port: 4590, model: 'google/gemini-2.5-flash-lite', maxQuestions: 5 }, loadConfig());
if (process.env.PORT) cfg.port = Number(process.env.PORT);

function readKey() {
  try { return fs.readFileSync(path.join(ROOT, 'key.txt'), 'utf8').trim(); }
  catch { return process.env.OPENROUTER_API_KEY || ''; }
}
const API_KEY = readKey();
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'craigokelly121@hotmail.com').toLowerCase();

/* the address pupils scan to - printed QRs and old links must keep working, so it
   is fixed rather than taken from the request host */
const APP_URL = (process.env.APP_URL || 'https://app.dotheygetit.app').replace(/\/+$/, '');

// ---- a small error log so the owner can see what actually broke
const ERROR_LOG = [];
function logError(where, message) {
  ERROR_LOG.unshift({
    at: Date.now(),
    where: String(where || '').slice(0, 120),
    message: String(message || '').slice(0, 300)
  });
  if (ERROR_LOG.length > 20) ERROR_LOG.length = 20;
}
process.on('uncaughtException', (e) => {
  console.error('uncaught', e);
  logError('(uncaught)', e && e.message);
});
process.on('unhandledRejection', (e) => {
  console.error('unhandled', e);
  logError('(promise)', (e && e.message) || String(e));
});

// -------------------------------------------------------------------- store
let store = { teachers: [], classes: [], sessions: [], tokens: {} };
let redis = null;

function normalise() {
  if (!Array.isArray(store.teachers)) store.teachers = [];
  if (!Array.isArray(store.classes)) store.classes = [];
  if (!Array.isArray(store.sessions)) store.sessions = [];
  if (!store.tokens || typeof store.tokens !== 'object') store.tokens = {};
}

// Storage: Redis when REDIS_URL is set (survives restarts and deploys),
// otherwise a local file. Free hosting wipes the file, which is why accounts
// used to vanish.
async function initStore() {
  if (process.env.REDIS_URL) {
    try {
      const { createClient } = require('redis');
      redis = createClient({ url: process.env.REDIS_URL });
      redis.on('error', e => console.error('  redis:', e.message));
      await redis.connect();
      const raw = await redis.get('getit:store');
      if (raw) Object.assign(store, JSON.parse(raw));
      normalise();
      console.log('  Storage: Redis — accounts and classes are kept');
      return;
    } catch (e) {
      console.error('  Redis unavailable (' + e.message + ') — using the local file');
      redis = null;
    }
  }
  try { Object.assign(store, JSON.parse(fs.readFileSync(DATA, 'utf8'))); } catch {}
  normalise();
  console.log('  Storage: local file — data is lost when the server restarts');
}

function saveStore() {
  if (redis) {
    redis.set('getit:store', JSON.stringify(store)).catch(e => console.error('  redis save:', e.message));
    return;
  }
  try { fs.writeFileSync(DATA, JSON.stringify(store, null, 2)); } catch {}
}
const readyPromise = initStore();

// --------------------------------------------------------------------- auth
function hashPass(pw, salt) { return crypto.scryptSync(pw, salt, 64).toString('hex'); }
function rid(n) { return crypto.randomBytes(n || 6).toString('hex'); }
function mkCode(len) {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  const b = crypto.randomBytes(len || 6);
  let s = '';
  for (let i = 0; i < (len || 6); i++) s += A[b[i] % A.length];
  return s;
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function currentTeacher(req) {
  const t = cookies(req).sid;
  if (!t) return null;
  const id = store.tokens[t];
  if (!id) return null;
  return store.teachers.find(x => x.id === id) || null;
}
function publicTeacher(t) { return { id: t.id, email: t.email, role: t.role || 'teacher', name: t.name || '' }; }

// ----------------------------------------------------------------------- llm
async function llm(messages, opts = {}) {
  if (!API_KEY) throw new Error('No API key. Add key.txt and restart.');
  const body = { model: opts.model || cfg.model, messages, temperature: opts.temperature === undefined ? 0.6 : opts.temperature };
  if (opts.json) body.response_format = { type: 'json_object' };
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'LLM error');
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

// ------------------------------------------------------------------- prompts
/* Every prompt that can put a question to a pupil shares this.
   The AI has been caught asking "what is this picture?" in a chat that has no
   picture in it. It does not know it is reaching a child through a text box, so
   it has to be told - every single time, in every prompt that asks anything.
   A question a pupil cannot answer is worse than no question: they sit and
   stare, then guess, and the teacher gets a red that means nothing. */
const NO_IMAGES = `Everything you say appears in a plain text box on a screen. There is no
picture, photo, diagram, graph, table, map or worksheet, and you cannot send one. The pupil
can only read the words you type. So: never ask about anything they are meant to look at,
never write "this picture", "the diagram", "the image" or "the graph", and never ask them to
draw, label, copy out or point at something. If an idea would normally need a picture, put it
into words instead.

Never write any of these words: picture, photo, image, diagram, figure, illustration,
worksheet, slide, poster, "look at the", "shown below", "what can you see", "on the board",
"on the screen", "draw a", "label the", "colour in", "point to". They all assume the pupil is
looking at something, and they are never needed: a question about a diagram can always be
asked in words. (Words like graph, chart, map and table are fine as ideas - "what does a bar
chart show you?" - just never as "look at the chart".)`;

function questionWriterSystem(topic, count) {
  return `You are helping a teacher write a quick understanding check.

Topic: "${topic}".

Write ${count} short, open questions that find out whether a student really understands this topic.

${NO_IMAGES}

Rules:
- One question each. Short and clear. Do not write answers.
- Start easy, get harder.
- At least one should ask them to explain or apply it in their own words.
- No yes/no questions.
- If the topic is naturally visual, ask about it in words: not "what can you see in this
  diagram of the water cycle?" but "what happens to rain after it lands?".

Return ONLY JSON: {"questions":["...","..."]}`;
}

function followupSystem(topic, nextQ, allowDig) {
  return `You are "Check", a calm but sharp examiner working for a teacher.

Topic: "${topic}".
The next teacher-approved question is: "${nextQ}".

Look ONLY at the student's most recent answer.
Decide: was it vague, dodged, a guess, or does it sound memorised rather than understood?
If yes, write ONE short follow-up question that would expose whether they really get it.
If no, do not write a question — the app will ask the teacher's question instead.

Keep it to ONE short, friendly sentence.

${NO_IMAGES}

Return ONLY JSON, no other text: {"followup":false,"question":""}
- Set "followup" to true and put your single follow-up question in "question" ONLY when you are asking a follow-up.${allowDig ? '' : '\n- You have already used your one follow-up, so "followup" MUST be false.'}`;
}

function askSystem(topic) {
  return `You are "Check", a friendly examiner. Topic: "${topic}".
Ask ONE short, open question to find out what the student understands.

${NO_IMAGES}

Return ONLY JSON: {"question":"..."}`;
}

/* Grade ONE answer on its own, then combine in code.
   Asking a single model call to weigh up a whole conversation proved
   unreliable: one class came back with no greens, the next with no reds.
   Adjectives could not place the threshold, so the combining is arithmetic
   now instead of another paragraph of prompt - and a pupil's level no longer
   depends on how many questions happened to be asked. */
function pairSystem(topic) {
  return `Topic: "${topic}". You are grading ONE pupil's answer to ONE question. Nothing else.

${NO_IMAGES}

Return ONLY JSON: {"level":"green","why":"..."}

- "green" = got the main idea right and showed they know why. Clumsy writing, wrong spelling
  and rough grammar are irrelevant - a pupil who understands in their own words is "green".
- "amber" = right idea with a real gap, or only partly there.
- "red" = gave no answer, guessed, or did not address the question asked.

A correct sentence that was clearly copied or rote-learned is "amber", not "red".`;
}

async function levelFromQuestions(topic, transcript) {
  /* The transcript is a flat list of "Student:" / "Examiner:" turns, and the
     text of a turn can run over several lines. Walk it properly - an earlier
     version of this paired the turns one out of step and fed the pupil's own
     previous answer in as the question, so a whole class came back red. */
  const turns = [];
  for (const line of transcript.split('\n')) {
    const m = line.match(/^(Student|Examiner):\s*(.*)$/);
    if (m) turns.push({ role: m[1].toLowerCase(), text: m[2].trim() });
    else if (turns.length) turns[turns.length - 1].text += ' ' + line.trim();
  }
  /* Grade each answer against the TOPIC, not against whichever question came
     before it: the examiner's follow-ups and the teacher's questions are not
     the same thing, and a pupil being asked something new is not a pupil
     failing to answer the old one. */
  const answers = turns.filter(t => t.role === 'student' && t.text).map(t => t.text);
  if (!answers.length) return '';
  const levels = [];
  for (const a of answers) {
    try {
      const raw = await llm([
        { role: 'system', content: pairSystem(topic) },
        { role: 'user', content: 'The pupil answered: ' + a }
      ], { json: true, temperature: 0, model: cfg.verdictModel || cfg.model });
      const o = parseJson(raw);
      if (o && o.level) levels.push(String(o.level).toLowerCase());
    } catch (e) { logError('/api/verdict per-question', e.message); }
  }
  if (!levels.length) return '';
  const order = ['green', 'amber', 'red'];
  const tally = {};
  levels.forEach(l => { tally[l] = (tally[l] || 0) + 1; });
  /* the level they reached most often; a tie goes to the better one, so one
     bad answer cannot pull down a pupil who understood the rest */
  return order.slice().sort((a, b) => (tally[b] || 0) - (tally[a] || 0) || order.indexOf(a) - order.indexOf(b))[0];
}

function verdictSystem(topic) {
  return `You are an examiner grading a short exam. Topic: "${topic}".

Work through this in order:

STEP 1 - List every point the student got RIGHT, even partly right. Be fair: partial credit counts as right.
A point only counts if it is an ANSWER TO WHAT WAS ASKED. A true fact about the topic
that does not answer the question is not a point - it is a dodge, and dodging is red.
STEP 2 - List what they got wrong or missed.
STEP 3 - Choose the level:
- "green" = they got the main idea right and can say how they know. That is the whole bar.
  They do NOT have to be fluent, complete, or use the correct words. A child who is right
  in their own rough language, or who gets there after one wobble, is "green".
- "amber" = they answered the actual question and got at least one part right, but there are clear gaps.
- "red" = they did not answer the question: nothing right, guesses, silences, or talks around it.

TWO WORKED EXAMPLES - copy this judgement:

Topic "how a plant gets its food". Student: "It does not eat anything. It takes the gas out
of the air and water up the roots and makes its own sugar using sunlight." Then asked what
happens in a cupboard: "It could not make the sugar so it would use up what it saved and then die."
-> GREEN. Rough wording, but the idea is there and they could use it on a new question.

Topic "the water cycle". Student: "It goes into the ground and then it gets hot and goes up
again. I dont know the words for it."
-> AMBER. Right direction, but there is no mechanism and they cannot say how they know.
Sounding unsure is fine; having nothing to why it happens is not green.

The difference is not polished English - it is whether they can do anything with the idea
beyond repeating it. Expect roughly a third of a class to be green. No greens at all means
you are too harsh. And being unsure between amber and red is amber.

HOW THEY WRITE MUST NOT CHANGE THE LEVEL. Judge the understanding, never the packaging.
Spelling, grammar, punctuation and clumsy sentences are irrelevant. A child who gets it
right in broken English is "green". Never lower a level because their "language is not
precise". In a school, punishing how a child writes is the fastest way to be wrong.

Thin but correct is "amber", not "red" - but it still has to be an answer.

A correct sentence that was clearly rote-learned or copied still counts as a right answer,
so it is "amber" - then flag it with faked. Copying is amber-with-a-flag, not red.

Set "faked" to true when the answer is copied or machine-written rather than thought:
dictionary-perfect or textbook sentences that they then cannot unpack in plain words,
sudden formal vocabulary far beyond the rest of how they talk, or answers that
contradict themselves when pressed. A child simply being wrong is NOT faked.

Return ONLY JSON, no other text, in exactly this shape:
{"gotRight":["..."],"level":"amber","gets":"...","shaky":"...","faked":false,"notes":"...","nextStep":"..."}

- gotRight: short list of the points they actually got right.
- gets: one short phrase of what they truly understand.
- shaky: one short phrase of where they are weak (or "" if none).
- notes: one short sentence a busy teacher can read at a glance.
- nextStep: a SHORT read on where this pupil is now - NOT an instruction. The teacher is the
  professional; you are telling them what you noticed, not what to do. Good: "Ready for
  multi-step word problems." / "Knows the method but not why it works - worth going back to."
  / "Confident on the basics, shaky the moment it is written as a problem." Never open with
  a command: no "Introduce...", "Ask them to...", "Show them...", "Use...", "Give them...".
  Describe the pupil's position and let the teacher decide what to do about it.

Be fair but honest. Partial understanding is "amber", not "red".`;
}

// ------------------------------------------------------------------- helpers
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.avif': 'image/avif' };

function sendJson(res, obj, extra) {
  const h = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  res.writeHead(200, h);
  res.end(JSON.stringify(obj));
}
function sendErr(res, msg, code) {
  res.writeHead(code || 400, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: msg }));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}
function parseJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch { return null; }
}
function serveStatic(req, res, p) {
  let rel = p === '/' ? 'index.html' : p;
  if (rel === '/help' || rel === '/help/') rel = 'help.html';           // the tutorials page
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('no'); }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }

    const type = MIME[path.extname(file)] || 'text/plain';
    const isMedia = /\.(mp4|webm|png|jpg|ico|woff2)$/i.test(file);
    const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': isMedia ? 'public, max-age=86400' : 'no-cache' };

    /* Range support - without it browsers will not seek in the tutorial videos */
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : st.size - 1;
        if (isNaN(start) || start < 0) start = 0;
        if (isNaN(end) || end >= st.size) end = st.size - 1;
        if (start > end) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); }
        res.writeHead(206, Object.assign({}, base, {
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Content-Length': end - start + 1
        }));
        if (req.method === 'HEAD') return res.end();
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
    }

    res.writeHead(200, Object.assign({}, base, { 'Content-Length': st.size }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}
function latestSessionForClass(classId) {
  const list = store.sessions.filter(s => s.classId === classId);
  list.sort((a, b) => b.createdAt - a.createdAt);
  return list[0] || null;
}

// -------------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  await readyPromise;
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (!p.startsWith('/api/')) return serveStatic(req, res, p);

    // ---- health
    if (p === '/api/health') return sendJson(res, { ok: true, hasKey: !!API_KEY, model: cfg.model });

    // ---- QR code for a class, for the whiteboard or a printed sheet
    if (p === '/api/qr' && req.method === 'GET') {
      const code = String(url.searchParams.get('code') || '').trim().toLowerCase();
      if (!/^[a-z0-9]{4,12}$/.test(code)) return sendErr(res, 'Bad class code.');
      const size = Math.min(1024, Math.max(180, Number(url.searchParams.get('size')) || 512));
      const link = APP_URL + '/?join=' + code;
      const png = await qrcode.toBuffer(link, {
        type: 'png', width: size, margin: 2,
        errorCorrectionLevel: 'Q',                       // survives a smudge or a photocopy
        color: { dark: '#000000', light: '#ffffff' }
      });
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': png.length,
        'Cache-Control': 'public, max-age=604800'
      });
      return res.end(png);
    }

    // ---- auth
    if (p === '/api/signup' && req.method === 'POST') {
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const pw = String(b.password || '');
      if (!email || !email.includes('@')) return sendErr(res, 'Please enter a valid email.');
      if (pw.length < 6) return sendErr(res, 'Password must be at least 6 characters.');
      if (store.teachers.find(t => t.email === email)) return sendErr(res, 'That email is already registered. Try logging in.');
      const salt = rid(8);
      const role = email === ADMIN_EMAIL ? 'admin' : 'teacher';
      const t = { id: rid(6), email, salt, hash: hashPass(pw, salt), role, createdAt: Date.now() };
      store.teachers.push(t);
      const tok = rid(16);
      store.tokens[tok] = t.id;
      saveStore();
      return sendJson(res, { teacher: publicTeacher(t) }, { 'Set-Cookie': `sid=${tok}; HttpOnly; Path=/; Max-Age=2592000` });
    }

    if (p === '/api/login' && req.method === 'POST') {
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const pw = String(b.password || '');
      const t = store.teachers.find(x => x.email === email);
      if (!t || hashPass(pw, t.salt) !== t.hash) return sendErr(res, 'Wrong email or password.');
      const tok = rid(16);
      store.tokens[tok] = t.id;
      saveStore();
      return sendJson(res, { teacher: publicTeacher(t) }, { 'Set-Cookie': `sid=${tok}; HttpOnly; Path=/; Max-Age=2592000` });
    }

    if (p === '/api/logout' && req.method === 'POST') {
      const tok = cookies(req).sid;
      if (tok) delete store.tokens[tok];
      saveStore();
      return sendJson(res, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
    }

    if (p === '/api/me') {
      const t = currentTeacher(req);
      return sendJson(res, { teacher: t ? publicTeacher(t) : null });
    }

    // ---- classes
    if (p === '/api/classes' && req.method === 'GET') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      const list = store.classes
        .filter(c => c.teacherId === t.id)
        .map(c => ({ id: c.id, name: c.name, code: c.code, checks: store.sessions.filter(s => s.classId === c.id).length }));
      return sendJson(res, { classes: list });
    }

    if (p === '/api/class' && req.method === 'POST') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      const b = await readBody(req);
      const name = String(b.name || '').trim();
      if (!name) return sendErr(res, 'Please give the class a name.');
      let code = mkCode(6);
      while (store.classes.find(c => c.code === code)) code = mkCode(6);
      const c = { id: rid(6), teacherId: t.id, name, code, createdAt: Date.now() };
      store.classes.push(c);
      saveStore();
      return sendJson(res, { class: { id: c.id, name: c.name, code: c.code, checks: 0 } });
    }

    // ---- student: look up class by code
    if (p === '/api/join' && req.method === 'GET') {
      const code = String(url.searchParams.get('code') || '').trim().toLowerCase();
      const c = store.classes.find(x => x.code === code);
      if (!c) return sendErr(res, 'No class found with that code.');
      const s = latestSessionForClass(c.id);
      if (!s) return sendErr(res, 'No check is ready for this class yet.');
      const names = [];
      (c.roster || []).forEach(n => { if (!names.includes(n)) names.push(n); });
      s.students.forEach(st => { if (!names.includes(st.name)) names.push(st.name); });
      return sendJson(res, { className: c.name, check: { id: s.id, topic: s.topic, questions: s.questions || [] }, names });
    }

    // ---- the class list: pupils pick their name instead of typing it
    if (p === '/api/roster' && req.method === 'POST') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      const b = await readBody(req);
      const c = store.classes.find(x => x.id === b.classId && x.teacherId === t.id);
      if (!c) return sendErr(res, 'Class not found.');
      const raw = Array.isArray(b.names) ? b.names : String(b.names || '').split(/[\n,;]+/);
      const seen = new Set();
      const names = [];
      raw.forEach(n => {
        const s = String(n || '').replace(/\s+/g, ' ').trim();
        if (!s || s.length > 60) return;
        const k = s.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        names.push(s);
      });
      c.roster = names;
      saveStore();
      return sendJson(res, { roster: names });
    }

    // ---- how each pupil has done across every check in this class
    if (p === '/api/pupils' && req.method === 'GET') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      const classId = url.searchParams.get('classId');
      const c = store.classes.find(x => x.id === classId && x.teacherId === t.id);
      if (!c) return sendErr(res, 'Class not found.');
      const checks = store.sessions.filter(s => s.classId === classId).sort((a, b) => a.createdAt - b.createdAt);
      const map = {};
      const order = [];
      checks.forEach(s => (s.students || []).forEach(st => {
        const k = String(st.name || '').trim().toLowerCase();
        if (!k) return;
        if (!map[k]) { map[k] = { name: st.name, results: [] }; order.push(k); }
        map[k].results.push({ topic: s.topic, at: s.createdAt, level: (st.verdict && st.verdict.level) || 'amber' });
      }));
      return sendJson(res, {
        roster: c.roster || [],
        checks: checks.length,
        pupils: order.map(k => map[k])
      });
    }

    // ---- checks (sessions)
    if (p === '/api/sessions' && req.method === 'GET') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      const classId = url.searchParams.get('classId');
      const c = store.classes.find(x => x.id === classId && x.teacherId === t.id);
      if (!c) return sendErr(res, 'Class not found.');
      const list = store.sessions
        .filter(s => s.classId === classId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(s => {
          const levels = { green: 0, amber: 0, red: 0 };
          s.students.forEach(st => {
            const l = (st.verdict && st.verdict.level) || 'amber';
            levels[l] = (levels[l] || 0) + 1;
          });
          return { id: s.id, topic: s.topic, createdAt: s.createdAt, students: s.students.length, questions: s.questions || [], levels };
        });
      return sendJson(res, { checks: list });
    }

    if (p === '/api/session' && req.method === 'POST') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      const b = await readBody(req);
      const c = store.classes.find(x => x.id === b.classId && x.teacherId === t.id);
      if (!c) return sendErr(res, 'Class not found.');
      const topic = String(b.topic || '').trim();
      if (!topic) return sendErr(res, 'A topic is required.');
      const questions = Array.isArray(b.questions) ? b.questions.map(q => String(q || '').trim()).filter(Boolean) : [];
      if (!questions.length) return sendErr(res, 'Add at least one question.');
      const s = { id: rid(4), classId: c.id, teacherId: t.id, topic, questions, students: [], createdAt: Date.now() };
      store.sessions.push(s);
      saveStore();
      return sendJson(res, { check: { id: s.id, topic: s.topic, createdAt: s.createdAt, students: 0 } });
    }

    if (p === '/api/session' && req.method === 'GET') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      const id = url.searchParams.get('id');
      const s = store.sessions.find(x => x.id === id && x.teacherId === t.id);
      if (!s) return sendErr(res, 'Check not found.');
      const c = store.classes.find(x => x.id === s.classId);
      return sendJson(res, { check: s, className: c ? c.name : '', classCode: c ? c.code : '' });
    }

    // ---- generate questions
    if (p === '/api/generate' && req.method === 'POST') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      const b = await readBody(req);
      const topic = String(b.topic || '').trim();
      if (!topic) return sendErr(res, 'Please type a topic first.');
      const count = Math.max(3, Math.min(8, Number(b.count) || cfg.maxQuestions));
      const raw = await llm([{ role: 'system', content: questionWriterSystem(topic, count) }], { json: true, temperature: 0.7 });
      const obj = parseJson(raw);
      let qs = obj && Array.isArray(obj.questions) ? obj.questions : [];
      qs = qs.map(q => String(q || '').trim()).filter(Boolean).slice(0, count);
      if (!qs.length) return sendErr(res, 'Could not generate questions. Try a clearer topic.');
      return sendJson(res, { questions: qs });
    }

    // ---- student chat
    if (p === '/api/chat' && req.method === 'POST') {
      const b = await readBody(req);
      const topic = String(b.topic || '').trim();
      const questions = Array.isArray(b.questions) ? b.questions.map(q => String(q || '').trim()).filter(Boolean) : [];
      const history = Array.isArray(b.history) ? b.history : [];
      let covered = Number(b.covered) || 0;
      let digs = Number(b.digs) || 0;
      if (!topic) return sendErr(res, 'A topic is required.');

      /* The code has to exist. Without this a pupil who mistypes it still gets a
         full, convincing conversation - and nothing they say ever reaches the
         teacher, who would have no idea they were missing. */
      const codeIn = String(b.code || '').trim().toLowerCase();
      const cls = store.classes.find(x => x.code === codeIn);
      if (!codeIn || !cls) return sendErr(res, 'That class code is not right. Check it with your teacher.');

      const total = questions.length || cfg.maxQuestions;
      const asked = history.filter(x => x.role === 'assistant').length;

      if (covered >= total) return sendJson(res, { reply: CLOSING, done: true, covered, digs });

      // Legacy: no seeded questions - let the AI ask each one.
      if (!questions.length) {
        const raw = await llm([{ role: 'system', content: askSystem(topic) }, ...history], { json: true, temperature: 0.6 });
        const obj = parseJson(raw);
        let q = ((obj && obj.question) || raw || '').replace(/\[done\]/gi, '').trim() || 'Tell me what you know about this.';
        if (asked === 0) q = "Hi! Let's find out how well you understand this.\n\n" + q;
        return sendJson(res, { reply: q, done: false, covered: covered + 1, digs });
      }

      // First turn: greet and ask the teacher's first question, word for word.
      if (asked === 0) {
        return sendJson(res, {
          reply: "Hi! Let's find out how well you understand this.\n\n" + questions[0],
          done: false, covered: 1, digs: 0
        });
      }

      const nextQ = questions[covered];
      const allowDig = digs < 1;
      const raw = await llm([
        { role: 'system', content: followupSystem(topic, nextQ, allowDig) },
        ...history
      ], { json: true, temperature: 0.4 });
      const obj = parseJson(raw);

      if (obj && obj.followup && typeof obj.question === 'string' && obj.question.trim() && allowDig) {
        return sendJson(res, { reply: obj.question.trim().replace(/\[done\]/gi, ''), done: false, covered, digs: digs + 1 });
      }
      return sendJson(res, { reply: nextQ, done: false, covered: covered + 1, digs });
    }

    // ---- verdict
    if (p === '/api/verdict' && req.method === 'POST') {
      const b = await readBody(req);
      const topic = String(b.topic || '').trim();
      const transcript = String(b.transcript || '').trim();
      if (!topic || !transcript) return sendErr(res, 'Missing topic or transcript.');
      const raw = await llm([
        { role: 'system', content: verdictSystem(topic) },
        { role: 'user', content: 'Transcript:\n' + transcript }
        /* temperature 0: the same answers must always get the same level. A
           teacher who re-reads a pupil cannot see the grade move. */
      ], { json: true, temperature: 0, model: cfg.verdictModel || cfg.model });
      let v = parseJson(raw);
      if (!v || !v.level) v = { level: 'amber', gets: '', shaky: '', faked: false, notes: 'Could not read a clear verdict.', nextStep: '' };

      /* the level comes from grading each question separately; everything else
         (gets / shaky / next step) still comes from the read above */
      try {
        const perQ = await levelFromQuestions(topic, transcript);
        if (perQ) v.level = perQ;
      } catch (e) { logError('/api/verdict per-question', e.message); }
      return sendJson(res, { verdict: v });
    }

    // ---- owner view: every teacher, class and check on the system
    // ---- owner: is the AI actually working right now?
    if (p === '/api/admin/selftest' && req.method === 'POST') {
      const me = currentTeacher(req);
      if (!me) return sendErr(res, 'Not signed in.', 401);
      if (me.role !== 'admin') return sendErr(res, 'Not allowed.', 403);
      const started = Date.now();
      try {
        const reply = await llm([
          { role: 'system', content: 'Reply with exactly: OK' },
          { role: 'user', content: 'ping' }
        ], { max_tokens: 5 });
        return sendJson(res, {
          ok: true, model: cfg.model, ms: Date.now() - started,
          reply: String(reply || '').trim().slice(0, 40) || '(empty)'
        });
      } catch (e) {
        logError('/api/admin/selftest', e.message);
        return sendJson(res, { ok: false, model: cfg.model, ms: Date.now() - started, error: e.message });
      }
    }

    // ---- owner: what has been breaking?
    if (p === '/api/admin/errors' && req.method === 'GET') {
      const me = currentTeacher(req);
      if (!me) return sendErr(res, 'Not signed in.', 401);
      if (me.role !== 'admin') return sendErr(res, 'Not allowed.', 403);
      return sendJson(res, {
        errors: ERROR_LOG,
        uptimeSec: Math.round(process.uptime()),
        storage: process.env.REDIS_URL ? 'redis' : 'file',
        startedAt: Date.now() - Math.round(process.uptime() * 1000)
      });
    }

    if (p === '/api/admin/overview' && req.method === 'GET') {
      const me = currentTeacher(req);
      if (!me) return sendErr(res, 'Not signed in.', 401);
      if (me.role !== 'admin') return sendErr(res, 'Not allowed.', 403);
      const teachers = store.teachers.map(x => {
        const classes = store.classes.filter(c => c.teacherId === x.id).map(c => {
          const checks = store.sessions.filter(s => s.classId === c.id);
          const students = checks.reduce((n, s) => n + (s.students || []).length, 0);
          return { id: c.id, name: c.name, code: c.code, checks: checks.length, students };
        });
        return {
          id: x.id, email: x.email, role: x.role || 'teacher', createdAt: x.createdAt,
          classes, checkCount: classes.reduce((n, c) => n + c.checks, 0),
          studentCount: classes.reduce((n, c) => n + c.students, 0)
        };
      }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const totals = {
        teachers: teachers.length,
        classes: store.classes.length,
        checks: store.sessions.length,
        students: store.sessions.reduce((n, s) => n + (s.students || []).length, 0)
      };
      return sendJson(res, { teachers, totals });
    }

    // ---- no-login checks: the teacher's browser remembers its own classes
    if (p === '/api/check' && req.method === 'POST') {
      const b = await readBody(req);
      const topic = String(b.topic || '').trim() || 'Untitled';
      const questions = Array.isArray(b.questions) ? b.questions.map(q => String(q || '').trim()).filter(Boolean) : [];
      if (!questions.length) return sendErr(res, 'No questions supplied.');
      let code = String(b.code || '').trim().toLowerCase();
      let c = null;
      if (code) {
        c = store.classes.find(x => x.code === code);
        if (c && c.key !== String(b.key || '')) return sendErr(res, 'That code is taken. Add a new class.');
      } else {
        code = mkCode(6);
        while (store.classes.find(x => x.code === code)) code = mkCode(6);
      }
      if (!c) {
        c = { id: rid(6), code, key: rid(14), name: String(b.name || '').trim(), anon: true, createdAt: Date.now() };
        store.classes.push(c);
      }
      const s = { id: rid(4), classId: c.id, topic, questions, students: [], createdAt: Date.now() };
      store.sessions.push(s);
      saveStore();
      return sendJson(res, { code: c.code, key: c.key, checkId: s.id, topic, questions, createdAt: s.createdAt });
    }

    if (p === '/api/results' && req.method === 'GET') {
      const code = String(url.searchParams.get('code') || '').trim().toLowerCase();
      const key = String(url.searchParams.get('key') || '').trim();
      const c = store.classes.find(x => x.code === code);
      if (!c) return sendErr(res, 'The server has forgotten this check (free hosting clears itself).');
      if (c.key !== key) return sendErr(res, 'Not your check.');
      const s = latestSessionForClass(c.id);
      if (!s) return sendErr(res, 'The server has forgotten this check (free hosting clears itself).');
      return sendJson(res, { topic: s.topic, questions: s.questions, createdAt: s.createdAt, students: s.students || [] });
    }

    // ---- save a student result (student submits with class code)
    if (p === '/api/result' && req.method === 'POST') {
      const b = await readBody(req);
      const code = String(b.code || '').trim().toLowerCase();
      const name = String(b.name || '').trim() || 'Student';
      const c = store.classes.find(x => x.code === code);
      if (!c) return sendErr(res, 'No class found with that code.');
      const s = latestSessionForClass(c.id);
      if (!s) return sendErr(res, 'No check is ready for this class yet.');
      s.students.push({ name, transcript: String(b.transcript || ''), verdict: b.verdict || null, at: Date.now() });
      saveStore();
      return sendJson(res, { ok: true });
    }

    // ---- delete a class, and everything inside it
    if (p === '/api/class/delete' && req.method === 'POST') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Please log in.', 401);
      const b = await readBody(req);
      const c = store.classes.find(x => x.id === b.classId && x.teacherId === t.id);
      if (!c) return sendErr(res, 'Class not found.');
      const gone = store.sessions.filter(s => s.classId === c.id).length;
      store.classes = store.classes.filter(x => x.id !== c.id);
      store.sessions = store.sessions.filter(s => s.classId !== c.id);
      saveStore();
      return sendJson(res, { ok: true, deletedChecks: gone });
    }

    // ---- delete one check
    if (p === '/api/session/delete' && req.method === 'POST') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Please log in.', 401);
      const b = await readBody(req);
      const s = store.sessions.find(x => x.id === b.id && x.teacherId === t.id);
      if (!s) return sendErr(res, 'Check not found.');
      store.sessions = store.sessions.filter(x => x.id !== s.id);
      saveStore();
      return sendJson(res, { ok: true });
    }

    // ---- change your own password
    if (p === '/api/password' && req.method === 'POST') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Please log in.', 401);
      const b = await readBody(req);
      const cur = String(b.current || '');
      const next = String(b.next || '');
      if (hashPass(cur, t.salt) !== t.hash) return sendErr(res, 'That is not your current password.');
      if (next.length < 6) return sendErr(res, 'The new password must be at least 6 characters.');
      if (next === cur) return sendErr(res, 'That is already your password.');
      t.salt = rid(8);
      t.hash = hashPass(next, t.salt);
      saveStore();
      return sendJson(res, { ok: true });
    }

    // ---- one pupil: every check they have done, oldest first
    if (p === '/api/pupil' && req.method === 'GET') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Please log in.', 401);
      const classId = url.searchParams.get('classId');
      const name = String(url.searchParams.get('name') || '').trim().toLowerCase();
      const c = store.classes.find(x => x.id === classId && x.teacherId === t.id);
      if (!c) return sendErr(res, 'Class not found.');
      const results = [];
      store.sessions
        .filter(s => s.classId === classId)
        .sort((a, b) => a.createdAt - b.createdAt)
        .forEach(s => (s.students || []).forEach(st => {
          if (String(st.name || '').trim().toLowerCase() !== name) return;
          results.push({
            checkId: s.id, topic: s.topic, at: s.createdAt,
            verdict: st.verdict || null,
            transcript: String(st.transcript || '').slice(0, 4000)
          });
        }));
      const real = results.filter(r => r.verdict);
      const last = real[real.length - 1] || {};
      return sendJson(res, {
        className: c.name,
        name: name,
        done: real.length,
        latest: last.verdict || null,
        results
      });
    }

    // ---- the whole class as a spreadsheet
    if (p === '/api/export' && req.method === 'GET') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Please log in.', 401);
      const classId = url.searchParams.get('classId');
      const c = store.classes.find(x => x.id === classId && x.teacherId === t.id);
      if (!c) return sendErr(res, 'Class not found.');
      const checks = store.sessions.filter(s => s.classId === classId).sort((a, b) => a.createdAt - b.createdAt);
      const names = [];
      (c.roster || []).forEach(n => { if (!names.includes(n)) names.push(n); });
      checks.forEach(s => (s.students || []).forEach(st => { if (st.name && !names.includes(st.name)) names.push(st.name); }));

      const quote = (v) => '"' + String(v === undefined || v === null ? '' : v)
        .replace(/"/g, '""').replace(/[\r\n]+/g, ' ').slice(0, 2000) + '"';
      const find = (s, n) => (s.students || []).find(x => String(x.name || '').trim().toLowerCase() === n.trim().toLowerCase());

      const head = ['Pupil']
        .concat(checks.map(s => s.topic + ' (' + new Date(s.createdAt).toISOString().slice(0, 10) + ')'))
        .concat(['Checks done', 'Latest level', 'Shaky on', 'Next step']);
      const rows = names.map(n => {
        const cells = checks.map(s => { const st = find(s, n); return st ? ((st.verdict && st.verdict.level) || 'amber') : ''; });
        const verdicts = checks.map(s => find(s, n)).filter(st => st && st.verdict).map(st => st.verdict);
        const last = verdicts[verdicts.length - 1] || {};
        return [n].concat(cells).concat([verdicts.length, last.level || '', last.shaky || '', last.nextStep || '']);
      });
      const csv = '\uFEFF' + [head].concat(rows).map(r => r.map(quote).join(',')).join('\r\n') + '\r\n';
      const fname = (c.name || 'class').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'class';
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + fname + '-get-it.csv"',
        'Cache-Control': 'no-store'
      });
      return res.end(csv);
    }

    return sendErr(res, 'Unknown endpoint.', 404);
  } catch (e) {
    logError(req.url, e.message || 'Server error');
    return sendErr(res, e.message || 'Server error', 500);
  }
});

server.listen(cfg.port, () => {
  console.log('');
  console.log('  Get It? is running');
  console.log('  ->  http://localhost:' + cfg.port);
  console.log('  Key loaded: ' + (API_KEY ? 'yes' : 'NO - add key.txt and restart'));
  console.log('');
  console.log('  Keep this window open. Close it to stop.');
  console.log('');
});