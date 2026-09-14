// Understanding Check - zero-dependency Node server
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
function questionWriterSystem(topic, count) {
  return `You are helping a teacher write a quick understanding check.

Topic: "${topic}".

Write ${count} short, open questions that find out whether a student really understands this topic.

Rules:
- One question each. Short and clear. Do not write answers.
- Start easy, get harder.
- At least one should ask them to explain or apply it in their own words.
- No yes/no questions.

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

Return ONLY JSON, no other text: {"followup":false,"question":""}
- Set "followup" to true and put your single follow-up question in "question" ONLY when you are asking a follow-up.${allowDig ? '' : '\n- You have already used your one follow-up, so "followup" MUST be false.'}`;
}

function askSystem(topic) {
  return `You are "Check", a friendly examiner. Topic: "${topic}".
Ask ONE short, open question to find out what the student understands.
Return ONLY JSON: {"question":"..."}`;
}

function verdictSystem(topic) {
  return `You are an examiner grading a short exam. Topic: "${topic}".

Work through this in order:

STEP 1 - List every point the student got RIGHT, even partly right. Be fair: partial credit counts as right.
STEP 2 - List what they got wrong or missed.
STEP 3 - Choose the level:
- "green" = explained the main idea in their own words and coped with follow-up questions.
- "amber" = they got at least one thing right, but there are clear gaps.
- "red" = they got nothing right at all, guessed throughout, or gave no real answer.

CRITICAL RULE: if your STEP 1 list is not empty, the level is "amber" or "green". Only use "red" if STEP 1 is completely empty. Most students who tried and got a few things right are "amber", not "red".

Do not be harsh just because their knowledge is thin - thin but partly correct is "amber".

Set "faked" to true only if their answers sound copied, AI-written, or contradict themselves.

Return ONLY JSON, no other text, in exactly this shape:
{"gotRight":["..."],"level":"amber","gets":"...","shaky":"...","faked":false,"notes":"...","nextStep":"..."}

- gotRight: short list of the points they actually got right.
- gets: one short phrase of what they truly understand.
- shaky: one short phrase of where they are weak (or "" if none).
- notes: one short sentence a busy teacher can read at a glance.
- nextStep: ONE short, specific thing the teacher should do next for this student.

Be fair but honest. Partial understanding is "amber", not "red".`;
}

// ------------------------------------------------------------------- helpers
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

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
function serveStatic(res, p) {
  const file = path.join(PUBLIC, p === '/' ? 'index.html' : p);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('no'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    res.end(data);
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
    if (!p.startsWith('/api/')) return serveStatic(res, p);

    // ---- health
    if (p === '/api/health') return sendJson(res, { ok: true, hasKey: !!API_KEY, model: cfg.model });

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
      s.students.forEach(st => { if (!names.includes(st.name)) names.push(st.name); });
      return sendJson(res, { className: c.name, check: { id: s.id, topic: s.topic, questions: s.questions || [] }, names });
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
      ], { json: true, temperature: 0.2, model: cfg.verdictModel || cfg.model });
      let v = parseJson(raw);
      if (!v || !v.level) v = { level: 'amber', gets: '', shaky: '', faked: false, notes: 'Could not read a clear verdict.', nextStep: '' };
      return sendJson(res, { verdict: v });
    }

    // ---- owner view: every teacher, class and check on the system
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

    return sendErr(res, 'Unknown endpoint.', 404);
  } catch (e) {
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