// Understanding Check - zero-dependency Node server
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const qrcode = require('qrcode');
const { chatComplete, describeProvider, runWithUsage, takeUsage } = require('./llm');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
/* Where the store lives. On a paid host you mount a disk and point DATA_DIR at it, so a deploy
   no longer wipes every class and answer. Unset, this is exactly what it always was. */
const DATA_DIR = process.env.DATA_DIR || ROOT;
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
const DATA = path.join(DATA_DIR, 'data.json');
/* Nightly backup: copy data.json into DATA_DIR/backups once a day, keep the last 14. */
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function backupData() {
  try {
    if (!fs.existsSync(DATA)) return;
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const dest = path.join(BACKUP_DIR, 'data-' + day + '.json');
    if (!fs.existsSync(dest)) fs.copyFileSync(DATA, dest);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (files.length > 14) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  } catch (e) { console.error('backup failed', e.message); }
}
setTimeout(backupData, 60 * 1000);
setInterval(backupData, 60 * 60 * 1000);
const CLOSING = 'Great — that is everything I needed. Thank you for thinking it through!';
/* The greeting lands in the transcript the teacher reads, so it stays in the same plain
   register as the questions. "Let's find out how well you understand this" is a form
   being filled in; a person asking would just say what they want. */
const GREET = 'Hi! A few quick questions. Just say what you think - your own words are best.\n\n';

// ------------------------------------------------------------------- config
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); }
  catch { return {}; }
}
const cfg = Object.assign({ port: 4590, model: 'google/gemini-2.5-flash-lite', maxQuestions: 5 }, loadConfig());
if (cfg.brainModel) cfg.model = cfg.brainModel;   // brainModel is the name teachers set; cfg.model is what the code calls it
if (process.env.PORT) cfg.port = Number(process.env.PORT);
if (process.env.BRAIN_MODEL) cfg.model = process.env.BRAIN_MODEL;
if (process.env.VERDICT_MODEL) cfg.verdictModel = process.env.VERDICT_MODEL;
if (process.env.CRITIC_MODEL) cfg.criticModel = process.env.CRITIC_MODEL;

function readKey() {
  try { return fs.readFileSync(path.join(ROOT, 'key.txt'), 'utf8').trim(); }
  catch { return process.env.OPENROUTER_API_KEY || ''; }
}
const API_KEY = readKey();

/* Speech-to-text runs on the same ElevenLabs account as the tutorial voiceover, so it
   reuses the key that is already in the repo for local work. On the host the env var
   wins. Empty means the mic route politely refuses rather than 500s. */
function readElevenKey() {
  const env = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_KEY;
  if (env && env.trim()) return env.trim();
  for (const f of ['.eleven.key', path.join('tutorial', '.eleven.key')]) {
    try { return fs.readFileSync(path.join(ROOT, f), 'utf8').trim(); } catch {}
  }
  return '';
}
const ELEVEN_KEY = readElevenKey();

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
  console.log('  Storage: local file at ' + DATA + ' — data is lost when the server restarts');
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
// ---- tiny in-memory rate limit, per IP. No package, no Redis, no cost.
// A Render restart wipes it, which is fine at this size. Two things get hit:
// the auth routes (bot signups / credential stuffing) and /api/result, which is
// the only route with no login behind it.
const HITS = new Map();
function ipOf(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}
function tooMany(req, bucket, max, winMs) {
  const k = bucket + ':' + ipOf(req), now = Date.now();
  let a = HITS.get(k);
  if (!a) { a = []; HITS.set(k, a); }
  while (a.length && now - a[0] > winMs) a.shift();
  if (a.length >= max) return true;
  a.push(now);
  return false;
}
// keep the map from growing forever
setInterval(() => {
  const now = Date.now();
  for (const [k, a] of HITS) if (!a.length || now - a[a.length - 1] > 3600000) HITS.delete(k);
}, 600000).unref();

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

/* Who is on the app right now. Memory only for the "right now" view: nothing
   in this block is written to the data file, Redis, or any analytics service.
   Teachers are the accounts already signed in. The owner already sees those.
   Pupils are children, so the pupil figure is an anonymous total and nothing
   else. It is the number of answers already saved on a check whose time is
   inside the last few minutes. Those answers were stored anyway, for the
   teacher. This count does not copy the name, the IP, a device, a cookie, or
   a history of its own. A pupil still typing is not in the number yet.
   Google Analytics is never involved, and pupil pages do not load it. */
const LIVE_WINDOW_MS = 5 * 60 * 1000;
const presence = { teachers: new Map(), checks: new Map() };

function prunePresence(now) {
  for (const map of [presence.teachers, presence.checks]) {
    for (const [k, at] of map) if (now - at > LIVE_WINDOW_MS) map.delete(k);
  }
}
setInterval(() => prunePresence(Date.now()), 60000).unref();

function noteTeacher(id) {
  if (!id) return;
  presence.teachers.set(id, Date.now());
}
function forgetTeacher(id) {
  if (id) presence.teachers.delete(id);
}
function noteCheck(id) {
  if (!id) return;
  presence.checks.set(id, Date.now());
}
function forgetCheck(id) {
  if (id) presence.checks.delete(id);
}
function noteCheckFromCode(code) {
  const c = String(code || '').trim().toLowerCase();
  if (!c) return;
  const cls = store.classes.find(x => x.code === c);
  if (!cls) return;
  const s = latestSessionForClass(cls.id);
  if (s) noteCheck(s.id);
}
/* Anonymous. Reads only the time already stored on an answer, never the name. */
function anonymousPupilCount(now) {
  const cut = now - LIVE_WINDOW_MS;
  let n = 0;
  for (const s of store.sessions) {
    for (const st of s.students || []) {
      if ((st.at || 0) >= cut) n++;
    }
  }
  return n;
}
function londonOffsetMs(utcMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(utcMs)).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - utcMs;
}
function londonMidnight(now) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date(now));
  /* Noon is never the clock change, so its offset is the offset at midnight too. */
  return Date.parse(day + 'T00:00:00Z') - londonOffsetMs(Date.parse(day + 'T12:00:00Z'));
}
function liveSnapshot() {
  const now = Date.now();
  prunePresence(now);
  const start = londonMidnight(now);
  let answersToday = 0, checksToday = 0;
  const teachersToday = new Set();
  for (const s of store.sessions) {
    if ((s.createdAt || 0) >= start) {
      checksToday++;
      if (s.teacherId) teachersToday.add(s.teacherId);
    }
    for (const st of s.students || []) {
      if ((st.at || 0) >= start) {
        answersToday++;
        if (s.teacherId) teachersToday.add(s.teacherId);
      }
    }
  }
  return {
    windowMin: LIVE_WINDOW_MS / 60000,
    teachers: presence.teachers.size,
    pupils: anonymousPupilCount(now),
    checksRunning: presence.checks.size,
    today: { checks: checksToday, answers: answersToday, teachers: teachersToday.size },
    asOf: now
  };
}

function currentTeacher(req) {
  const t = cookies(req).sid;
  if (!t) return null;
  const id = store.tokens[t];
  if (!id) return null;
  const teacher = store.teachers.find(x => x.id === id) || null;
  if (teacher) noteTeacher(teacher.id);
  return teacher;
}
function publicTeacher(t) { return { id: t.id, email: t.email, role: t.role || 'teacher', name: t.name || '' }; }

// ----------------------------------------------------------------------- llm
/* Gemini first when GEMINI_API_KEY is set; OpenRouter if that call fails.
   No Gemini key: this is the old OpenRouter call, unchanged.
   MOCK_AI is off unless the 15-pupil test sets it. Never set it on the live
   site: every mark would be fake. */
function mockAiReply(messages) {
  const blob = (messages || []).map(m => String((m && m.content) || '')).join('\n');
  if (/Reply with exactly:\s*OK/i.test(blob)) return 'OK';
  if (/"followup"/.test(blob)) return JSON.stringify({ followup: false, question: '' });
  if (/"shown"/.test(blob)) return JSON.stringify({ shown: [1], reason: true });
  if (/gotRight/.test(blob)) {
    return JSON.stringify({
      gotRight: ['the main idea'],
      level: 'amber',
      gets: 'the main idea',
      shaky: 'why it works',
      faked: false,
      notes: 'Test mark, not a real model.',
      nextStep: 'Has the idea, thin on why.'
    });
  }
  if (/"marks"/.test(blob)) return JSON.stringify({ marks: [['says the idea', 'says why']] });
  if (/"level"/.test(blob)) return JSON.stringify({ level: 'amber', why: 'test mark' });
  if (/"question"/.test(blob)) return JSON.stringify({ question: 'What is one thing you remember?' });
  return 'OK';
}

let markerOverride = null;
function setMarker(fn) { markerOverride = fn || null; }
async function llm(messages, opts = {}) {
  if (markerOverride) return markerOverride(messages, opts);
  if (process.env.MOCK_AI === '1') return mockAiReply(messages);
  return chatComplete(messages, {
    model: opts.model || cfg.model,
    temperature: opts.temperature,
    json: opts.json,
    maxTokens: opts.maxTokens || opts.max_tokens
  }, { openrouterKey: API_KEY });
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

/* The question comes before everything else. If the child cannot read it once and know
   what they are being asked, nothing downstream matters - not the marking, not the card.
   A post office manager (numerate, not a teacher) could not get through
   "Imagine you have a pizza cut into eight equal slices. If you eat three slices, what
   fraction of the pizza is left?" without going back over it. If an adult has to read it
   twice, a ten-year-old has already guessed. Three questions from one real check are in
   the WRONG -> RIGHT list below, so the bar is the same one the teacher is asking for. */
const PLAIN_WORDS = `Write it the way you would SAY it to a ten-year-old, out loud, in one breath.

Every question must pass all of these:
- ONE question mark. Never two questions joined into one.
- 18 words at most, and most should be under 12. No single sentence over 14 words.
- ONE job. If it needs two steps or two things worked out, that is two questions - so
  drop one. A quick check asks one thing at a time.
- No scene-setting. No "Imagine you have...", "Suppose that...", "Consider a...". Give
  the facts flat and let them get on with it.
- Plain words for the idea, and no long words to sound clever. Use the term the class
  used, once, with a plain gloss beside it.
- An "explain" question is fine, but it must name the thing to explain in everyday words
  and still be short.

Read it back once, at normal speed. Could a ten-year-old answer it straight off without
asking what you mean? If not, write it again, shorter.

WRONG -> RIGHT
"Consider the various factors that might influence the outcome of the experiment." ->
"What could change the result of the test?"
"Explain the reasoning behind the procedure you use when describing a character." ->
"How can you tell what a character is like?"
"Imagine you have a list of words to learn. Which ones would be trickiest and why?" ->
"Which of these words is hardest to spell, and why?"
"Say something about what happened at the start of the story." -> "How does the story
begin?"`;

/* The maths worked examples. They are ONLY for a maths topic: dropped into a spelling or
   history check they overpower the topic and the model writes sums for the wrong subject. */
const PLAIN_MATHS = `MATHS WRONG -> RIGHT
"Imagine you have a pizza cut into eight equal slices. If you eat three slices, what
fraction of the pizza is left?" -> "You eat 3 slices of a pizza cut into 8. What fraction
is left?"
"Explain why two quarters of a pizza is the same amount as half a pizza." -> "Why is 2
quarters the same as a half?"
"If you are saving up for a game that costs twenty pounds and you have already saved
eight pounds, how many more pounds do you need to save?" -> "A game costs 20 pounds. You
have 8 pounds. How much more do you need?"
"What is the answer when you add five and seven?" -> "What is 5 + 7?"
"Explain the reasoning behind the procedure you use when the denominators match." ->
"Why do you only add the top numbers?"
On a maths question put numbers as digits, not words: "5 + 7", not "five and seven".`;

/* One idea per mark point. The model kept bundling several ideas into a single point
   ("uses sunlight, water and carbon dioxide to make glucose"), and it even emitted two
   points as one comma-joined string. A bundled point cannot be half-hit, so a pupil who
   half understood scored the same as one who did not - which is what put the middle band
   all over the place. */
const MARK_RULES = `Write 2 or 3 mark points for each question - 2 for a question with one main idea,
3 only for a richer question. Never pad a question out to three: if two points say the
same thing in different words, that is one point, and the pupil's mark is meaningless.

FIRST, and above everything else: a point must be something the pupil could actually SAY
in their answer to that question. If the question asks for a fact or a word, one point has
to BE that fact or word. A point a short, correct answer cannot reach is dead weight: it
marks every pupil down for something the question never asked. A question that asks for ONE
fact has ONE point, and that point is the fact. One fact means who someone was, what something
was called, which one it was, a single name, a single date, a spelling, or a first letter.
"Who was the leader of Germany in the Second World War?" is one point: "Adolf Hitler". It is
not also "he was a dictator". The question did not ask that, and the extra point marks a right
answer down. "What was the war called?" is one point: "the Second World War". World War Two
and WW2 are that same point, not a second one.
A question that really has two parts (a sum with working worth showing, or a why) still gets
the answer and the working, as separate points. A bare sum, a spelling, a name, or a "what
was it called" has no working. Write one point. "Knows the word apple" beside "knows the
first letter" is not a second point. It marks a child down for answering a one-word question
in one word.
WORK OUT THE RIGHT ANSWER YOURSELF FIRST, then write the point that gives THAT answer. A
point carrying the wrong answer is worse than no point at all: it marks the pupils who are
right down for being right, and hands credit to the ones who are wrong.
For a question that asks WHY - "explain why..." - there is no single word to give, so its
points are the reasons. One of them must be the claim itself, in the words a pupil would
likely use, so that a muddled but real attempt can reach it. A pupil who gets there in
clumsy words has shown the idea; never write a point that needs tidy wording to be reachable.
On a WHY question the points are separate REASONS. Two reasons that are the same idea in
different words are ONE point; writing both doubles the marks against a pupil who gave that
one reason. If you can say "in other words..." and your second point is what follows, delete it.
WRITE EVERY POINT IN THE WORDS THE PUPIL WOULD SAY OUT LOUD, not the words from the
textbook. This is the difference between marking the idea and marking the vocabulary. A
point written in schoolbook language is reachable ONLY by the pupil who has memorised the
phrase - the child who understands it but says it their own way scores nothing, which is
backwards and is the one thing a teacher will not forgive. Written plainly, both reach it.
That means a question with several valid ways to answer has ONE working point, not one per
way. Write the ONE point so any route reaches it, and let the answer point carry the rest.
Never repeat the same idea as two points: if two points would both be ticked by the same
answer, they are ONE point, not two.
NEVER WRITE THE ANSWER TWICE. The same fact said another way is ONE point, not two.
"Also known as the Second World War" beside "it was called World War Two" is the same point.
A second point is only allowed when the question asks for a second, different thing: the
working on a sum that needs it, or a separate reason on a why or how question. A point the
question never asked for is padding, and it makes a correct pupil look weaker. If you can
say "in other words" or "also known as", delete the second point.
Each point is ONE idea in ONE short sentence, twelve words or so. Never put two ideas in
one point and never write a list inside one. If you catch yourself writing a comma followed
by "and", that is two points - split them.
They must be about the subject, and never about how it is written.
Bad: "clear answer", "good use of vocabulary".`;

/* Only for a maths topic - see the note on PLAIN_MATHS. */
const MARK_MATHS = `MATHS EXAMPLES (work the answer out yourself first):
Q: "What is 5 + 7?"  Good: ["says 12", "adds the two numbers together"]
Bad: ["explains that five and seven were added together"] - the pupil never says that.
Q: "You eat 2 of 10 apples. How many are left?"  Good: ["says 8", "takes 2 away from 10"]
Q: "A pizza of eight slices has three eaten. What fraction is left?"
Good: ["says five eighths", "works out eight take away three"]   Bad: ["says three eighths"]
A question that just asks for the result of a sum - "What is 15 + 8?", "30 - 12" - has ONE
point: the answer, in the words a pupil would say. Do NOT add "adds the two numbers
together" or "subtracts 12 from 30" as a second point. There is no method a pupil can show
on a bare sum - the number IS the answer - and the extra point can only mark them down for
answering a sum correctly, which is the one thing a teacher will not forgive.
Where a question can be answered by more than one valid method - a common denominator,
cross-multiplying, decimals, a drawing, comparing each to a whole - the working point must
be reachable by ANY of them, so a pupil who shows the same idea another way still reaches it.
Q: "What is 105 + 7?" -> "says 112" and "adds the two numbers together".`;

/* Is a question's marking reachable at all? A question that asks for an answer has to
   have at least one point that IS the answer, or every pupil who answers it correctly is
   marked down for not saying something the question never asked.
   This came off four real family answers: "What is 5 + 7?" answered "12" was marked
   against "Addition is combining two amounts together" and "The sum is the total after
   adding". Three of the five questions did that, so 6 of the 10 points were unreachable
   for anybody - and all four pupils came back red, including the one who got everything
   right. Every point on those questions was a statement about the method, and no pupil
   answering "12" can ever say one. */
const ASKS_FOR_ANSWER = /^(explain|why|describe|give a reason|how do you know)/i;
const NUMBERED = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|fifty|hundred|thousand|half|quarter|third|fifth|tenth)\b/i;
const ANSWER_WORD = /\b(says|say|states|gives|answers|writes|shows|names|counts|gets|works out)\b/i;
function answerable(question, pts) {
  const q = String(question || '').trim();
  const list = (pts || []).filter(Boolean);
  if (!list.length) return false;
  if (ASKS_FOR_ANSWER.test(q)) return true;   // a why/explain question is reachable by reasoning
  if (!NUMBERED.test(q)) return true;         // no numbers in it, nothing to be unreachable about
  return list.some(p => /\d/.test(p) || NUMBERED.test(p) || ANSWER_WORD.test(p));
}

/* Split any point that came back carrying two ideas, and drop the "The pupil ..." preface. */
/* A question that asks only for the result of a sum. It has no method to show, so it gets
   one mark point - the answer - and is exempt from the two-point rule below. A question
   that asks why, or how you know, is never one of these. */
function plainSum(q) {
  const t = String(q || '').toLowerCase();
  if (/why|explain|how do you know|how can you tell|same as|because|reason/.test(t)) return false;
  return /\d\s*(?:[-+\/×]|plus|minus|times|add|subtract|take away|multiplied by|multiply|divided by)\s*\d/.test(t);
}
/* A question whose answer is one letter, one word or one spelling. There is no working
   to show on these, so they have ONE point - the answer - and a pupil who is right can
   always reach it. Without this the writer adds a second point ("knows the word 'apple'"
   beside "knows the first letter") and a child who answers every question correctly comes
   back on 5 of 10. */
function shortFact(q) {
  const t = String(q || '').toLowerCase();
  if (/why|explain|how do you know|how can you tell|because|reason/.test(t)) return false;
  return /first letter|last letter|what letter|spell the word|how do you spell|starts with|ends with/.test(t);
}
/* A question whose whole answer is one name, one title, or one date. "Who was the leader
   of Germany?" does not have a second fact hiding in it, and "what was it called?" does
   not have an "also known as". A fully right answer to one of these is full credit, so
   the scheme is one point. A why, a how, or a "what changed" is not one of these. */
function asksOneFact(q) {
  const t = String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (/\b(why|explain|how come|how do|how does|how did|how can|how would|what changed|what difference|what effect|what impact|what happened)\b/.test(t)) return false;
  if (/^what (?:was|is|were|are) the name\b/.test(t)) return true;
  if (/^what (?:was|is|were|are) .{0,48} called\b/.test(t)) return true;
  if (/^who (?:was|is|were|are)\b/.test(t)) return true;
  if (/^which (?:person|country|leader|king|queen|name)\b/.test(t)) return true;
  if (/^what year\b/.test(t) || /^what date\b/.test(t)) return true;
  if (/^when (?:was|did|were)\b/.test(t) && !/\b(and|why|how)\b/.test(t)) return true;
  return false;
}
function minPointsFor(q) {
  if (plainSum(q) || shortFact(q) || asksOneFact(q)) return 1;
  return 2;
}
/* The right answer to a short-fact question, worked out from the question itself so a
   correct answer is never left uncredited. */
function shortAnswer(q) {
  const t = String(q || '');
  const m = t.match(/['"\u2018\u2019\u201c\u201d]([A-Za-z]+)['"\u2018\u2019\u201c\u201d]/);
  const w = m ? m[1].toLowerCase() : null;
  const lt = t.toLowerCase();
  if (w && /first letter/.test(lt)) return [w[0]];
  if (w && /last letter/.test(lt)) return [w[w.length - 1]];
  if (w && /spell the word/.test(lt)) return [w, w.split('').join('-')];
  return null;
}
const normAns = a => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* The number a simple question works out to, computed in code. Used to credit a bare
   correct answer even when the mark points only describe the operation, not the result. */
function arith(q) {
  const t = String(q || '').toLowerCase();
  if (/why|explain|how do you know|how can you tell|same as|because|reason/.test(t)) return null;
  let m;
  if ((m = t.match(/(\d+)\s*pairs?\b/)) && /pairs?\b/.test(t)) return Number(m[1]) * 2;
  if ((m = t.match(/groups? of (\d+)\D*?in (\d+)/))) return Number(m[2]) / Number(m[1]);
  if ((m = t.match(/(\d+)\s*(?:multiplied by|times|multiply|×)\s*(\d+)/))) return Number(m[1]) * Number(m[2]);
  if ((m = t.match(/(\d+)\s*(?:divided by|shared between|split between)\s*(\d+)/))) return Number(m[1]) / Number(m[2]);
  if ((m = t.match(/(\d+)\s*(?:plus|and|add(?:ed to)?)\s*(\d+)/))) return Number(m[1]) + Number(m[2]);
  if ((m = t.match(/(\d+)\s*(?:minus|subtract(?:ed from)?|take away|take|less)\s*(\d+)/))) return Number(m[1]) - Number(m[2]);
  if ((m = t.match(/(\d+)\s*\+\s*(\d+)/))) return Number(m[1]) + Number(m[2]);
  if ((m = t.match(/(\d+)\s*-\s*(\d+)/))) return Number(m[1]) - Number(m[2]);
  return null;
}

function splitPoints(list) {
  const out = [];
  for (const raw of list) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) continue;
    if (s === '[object Object]') continue;
    s = s.replace(/^(the\s+)?pupil\s+/i, '').replace(/^\-\s*/, '');
    /* Commas inside brackets are part of one idea - "converts to decimals (5/7 is 0.71, 0.8)"
       is a single point, not two. Park them so the comma rules below cannot split a point
       down the middle, and put them back after. */
    s = s.replace(/\(([^)]*)\)/g, m => m.replace(/,/g, '\u0001'));
    /* The model bundles two ideas into one string, lower case after the join, so a
       sentence rule that needs a capital walks straight past it:
       "finds a common denominator,the pupil converts fractions to have common denominators".
       Turn the ", the pupil" join into a full stop, then split on any full stop, semicolon
       or spaced dash - one idea per point is the whole basis of the marking. */
    s = s.replace(/,\s*the pupil\s+/gi, '. ');
    /* and the same trick without the preface: "explains that X,explains that Y". The
       writer reaches for a verb list when it bundles, so split on a comma followed by
       one of those verbs. Both halves stay - which is the point. */
    s = s.replace(/,\s*(?=(explains|states|says|shows|knows|mentions|names|identifies|describes|uses|writes|adds|compares|tells|keeps|gives|notes|because|since|takes|subtracts|combines|calculates|works|finds|converts|multiplies|divides|counts|removes|leaves|equals|means|matches|lists|repeats|orders|rounds|solves|answers|represents|totals|so|then|therefore)\b)/gi, '. ');
    /* …and the same for a comma followed by a number or a fraction. The writer bundles
       the whole method into one point - "3/4 is 15/20 and 4/5 is 16/20, so 4/5 is bigger,
       4/5 is 0.8 and 3/4 is 0.75, so 4/5 is bigger" - and no verb follows the comma, so
       the rule above walks past it. A pupil who knows the answer but not the whole
       two-step method then scores nothing at all. */
    s = s.replace(/,\s*(?=(?:so|then)?\s*(?:\d|[a-z]?\d+\s*\/\s*\d+))/gi, '. ');
    const parts = s.split(/[.;]\s+|\s+[-\u2013]\s+/).map(x => x.trim().replace(/^(so|then|therefore|and)\s+/i, '').replace(/[,.]$/, '').trim()).map(x => x.replace(/\u0001/g, ','));
    for (const p of parts) {
      if (p.length < 12) continue;              /* too short to be a real point on its own */
      if (/[,.]\s+and\s+/i.test(p) && p.length > 60) {
        /* a comma-and joining two long clauses is two ideas - keep both halves */
        p.split(/,\s+and\s+/i).forEach(h => { const t = h.trim().replace(/[,.]$/, ''); if (t.length >= 12) out.push(t); });
      } else out.push(p);
    }
  }
  /* The writer sometimes gives the same point twice in different words' clothing
     ("is five eighths" twice on one question). The rules forbid it, and on the card it
     reads as padding - worse, it doubles a point the pupil cannot reach twice, which
     quietly lowers everyone's score. Identical points are collapsed.
     Compared on letters and digits only, so casing and punctuation cannot smuggle a
     duplicate through. */
  const METHOD_TAGS = [[/\b(bottoms?|denominators?|lcd|lcm)\b/, 'denom'], [/\b(tops?|numerators?)\b/, 'numer'], [/\bdecimals?\b/, 'dec'], [/\bcross[\s-]?multipl\w*\b/, 'cross'], [/\b(number line|bar model|diagram|draw\w*|picture)\b/, 'vis']];
  const tagOf = p => { const t = p.toLowerCase(); return METHOD_TAGS.filter(x => x[0].test(t)).map(x => x[1]); };
  const seen = new Set();
  const tags = [];
  return out.filter(p => {
    const k = p.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
    if (!k || seen.has(k)) return false;
    /* Two points that both name the same method are one idea in different words - a pupil
       using one phrasing ticks one and misses the other, and the card reads as a
       contradiction. Keep the first. */
    const tg = tagOf(p);
    if (tg.length && tg.some(t => tags.some(x => x.includes(t)))) return false;
    seen.add(k); tags.push(tg);
    return true;
  }).slice(0, 3);
}

/* The critic's corrected scheme. A one-fact question is allowed to come back with a
   single point, and any extra point is dropped, because that extra point is the padding.
   A why, a how, or a fraction sum still has to come back with two points. A thin critic
   pass on those is ignored, so a bad critic cannot wipe a scheme the writer already got
   right. Returns null when the caller should keep the scheme it already has. */
function takeCriticMarks(question, proposed) {
  const fixed = splitPoints(Array.isArray(proposed) ? proposed : []);
  if (!fixed.length) return null;
  if (asksOneFact(question) || shortFact(question)) return fixed.slice(0, 1);
  if (fixed.length >= 2) return fixed;
  return null;
}

function criticSystem(topic, audit) {
  return `You are checking the marking scheme for a short school quiz on "${topic}".
For each question, every point must be something THAT question actually asks for, and it must be true.
A point that adds a fact the question did not ask for is wrong. Delete it.
Two points that are the same fact in different words are one point. WW2, World War Two and the Second World War are the same fact. Keep one.
A question that asks for one fact (who, what it was called, a name, a date, a spelling) has ONE point: the answer. Do not add a working point. There is nothing else to show.
A why, how, or "what changed" question keeps one point per separate reason the question asks for. Do not add a vague extra point that only restates the others.
Be strict about the maths: "the denominators are the same" is FALSE for "which is bigger, 1/2 or 1/4?" because they are 2 and 4. A rule that only holds for some numbers is wrong.
Keep each point short and in plain words. Do NOT use commas inside a point. Write "and" instead, so a point can never be split in two.
${audit}
Return ONLY JSON: {"marks":[["point"],["point 1","point 2"]]} - one array per question, in order, all of them. One point is correct when the question asks for one fact.`;
}

/* Is this a maths topic? Only maths checks get the maths worked examples in the prompts -
   in a spelling or history check those examples hijack the subject. */
function isMathsTopic(t) {
  return /math|arithmetic|number|sum|add|subtract|multipl|divid|times table|fraction|decimal|percentage|percent|algebra|geometry|shape|measur|money|count|equation|area|perimeter|place value|rounding/.test(String(t || '').toLowerCase());
}
function plainWordsFor(t) { return isMathsTopic(t) ? PLAIN_WORDS + '\n\n' + PLAIN_MATHS : PLAIN_WORDS; }
function markRulesFor(t) { return isMathsTopic(t) ? MARK_RULES + '\n\n' + MARK_MATHS : MARK_RULES; }

/* Year 7 and above are secondary. The plain-words rules still keep a question short,
   but "say it to a ten-year-old" on its own was producing "what was the big war called?"
   on a World War Two check. Pitch the idea up. Leave Year 5 and Year 6, and a class
   with no year set, on the original wording apart from the topic-title rule below. */
function yearPitch(year) {
  const y = String(year || '').trim();
  if (!y) return '';
  const n = Number((y.match(/\d+/) || [])[0]);
  const older = (n >= 7) || /college|adult|gcse|ks3|ks4|ks5/i.test(y);
  if (!older) return '';
  return `\n\nThe class is ${y}. Keep each question short and in plain words, but pitch the idea at ${y}, not at a ten-year-old. Ask about a cause, a consequence, or how something works. One straightforward fact is fine. Do not write a question the topic title already answers, and do not write an essay or a university question.`;
}

function questionWriterSystem(topic, count, year) {
  return `You are helping a teacher write a quick understanding check.

THE TOPIC IS "${topic}". Every single question must be about THIS topic and nothing else.
Stay on the subject the teacher gave you, in their words. If the topic is spelling, reading,
history, science or anything that is not maths, write NO sums, NO numbers and NO fractions -
a spelling check gets spelling questions. The worked examples further down are there to show
the STYLE of a good question, never the subject: copy how they are written, not what they are
about. Getting the subject wrong makes the whole check useless to the teacher.

Write ${count} short, open questions that find out whether a student really understands this topic.

${plainWordsFor(topic)}
${yearPitch(year)}

${NO_IMAGES}

Rules:
- One question each. Short and clear. Do not write answers.
- Start easy, get harder.
- At least one should ask them to explain or apply it in their own words.
- No yes/no questions.
- Do not ask a question a pupil can answer just by repeating the topic. If the topic is
  "World War Two", "What was the name of the big war?" is not a question. Ask something
  the title does not already give away.
- If the topic is naturally visual, ask about it in words: not "what can you see in this
  diagram of the water cycle?" but "what happens to rain after it lands?".

Return ONLY JSON, exactly this shape:
{"questions":["...","..."],"marks":[["...","..."],["...","..."]]}

"marks" is a parallel list: marks[0] holds the mark points for questions[0], and so on.
${markRulesFor(topic)}`;
}

/* The teacher has written or edited the questions. These are the mark points for THEM.
   Without this the marks were drafted against whatever questions the AI would have
   written itself, so a class was being marked against the wrong question. */
function markWriterSystem(topic, questions) {
  const list = questions.map((q, i) => (i + 1) + '. ' + q).join('\n');
  return `Topic: "${topic}".

Write the mark points for the topic "${topic}" and for THESE questions only. Any worked
example below shows the STYLE of a good point, never the subject - do not import its maths
into a non-maths topic.

A teacher wrote these questions to find out whether a pupil really understands it:
${list}

${markRulesFor(topic)}

${NO_IMAGES}

Return ONLY JSON, one list per question, in the same order as the questions:
{"marks":[["...","..."],["...","..."]]}`;
}

function followupSystem(topic, nextQ, allowDig) {
  return `You are "Check", a calm examiner. Topic: "${topic}".
The next teacher question is: "${nextQ}".
Look ONLY at the student's latest answer. If it was vague, a dodge, a guess, or memorised, set followup true and write ONE short question. If it was a real answer, set followup false and leave question empty. The app will ask the teacher's question.
One sentence. Plain text only: there is no picture, so never mention a picture, diagram or worksheet.
${plainWordsFor(topic)}
Return ONLY JSON: {"followup":false,"question":""}${allowDig ? '' : '\nYou already asked your one follow-up, so followup must be false.'}`;
}

function askSystem(topic) {
  return `You are "Check", a friendly examiner. Topic: "${topic}".
Ask ONE short, open question to find out what the student understands.

${plainWordsFor(topic)}

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
- A bare right answer with no reasoning at all is "amber", never "green". Green needs the pupil to show they know WHY, not just the right word or number.

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
      ], { json: true, temperature: 0, model: cfg.verdictModel || cfg.model, maxTokens: 80 });
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

/* Mark by COUNTING, not by opinion.
   The old way asked the model "how well did this child understand?" - a question with no
   fixed answer, which is why it swung between a class of no greens and a class of no reds
   however the prompt was worded. Now the teacher's mark points are the standard: we ask only
   "did this answer show point 1? point 2?" and then add up.
   All the points = green. Some of them = amber. None = red. */
/* Trim an answer to something that fits beside a mark point, without cutting a word in
   half. Whatever comes out is the pupil's own words, never a paraphrase of them - the
   whole point of showing it is that the teacher can check the claim for themselves. */
function clip(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n - 30 ? cut.slice(0, sp) : cut).replace(/[,;:.!?]+$/, '') + '...';
}

/* Every number in a line of text, digits or words, so a point can be compared with the
   question and with what the pupil typed without the model getting a vote. */
const WORD_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
  forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  thousand: 1000, million: 1000000, half: 0.5, quarter: 0.25, third: 0.333, tenth: 0.1,
  fifth: 0.2, eighth: 0.125
};
function nums(s) {
  const t = String(s || '').toLowerCase();
  const out = (t.match(/\d+(?:[.,]\d+)?/g) || []).map(n => n.replace(/,/g, ''));
  (t.match(/[a-z]+/g) || []).forEach(w => { if (WORD_NUM[w] !== undefined) out.push(String(WORD_NUM[w])); });
  return out;
}

/* Fractions written as words, so "a fifth" and "1/5" are the same thing to the checks
   below. Both of those appear in real pupil answers and in real mark points. */
const WORD_FRAC = {
  half: '1/2', halves: '1/2', third: '1/3', thirds: '1/3', quarter: '1/4', quarters: '1/4',
  fourth: '1/4', fourths: '1/4', fifth: '1/5', fifths: '1/5', sixth: '1/6', sixths: '1/6',
  seventh: '1/7', sevenths: '1/7', eighth: '1/8', eighths: '1/8', ninth: '1/9', ninths: '1/9',
  tenth: '1/10', tenths: '1/10', twelfth: '1/12', twelfths: '1/12',
  twentieth: '1/20', twentieths: '1/20'
};
const COUNT_WORD = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const DENOM_WORD = {
  half: 2, halves: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4,
  fifth: 5, fifths: 5, sixth: 6, sixths: 6, eighth: 8, eighths: 8, ninth: 9, ninths: 9,
  tenth: 10, tenths: 10, twelfth: 12, twelfths: 12
};
function countOf(w) {
  const s = String(w || '').toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  return COUNT_WORD[s];
}
/* "three quarters" is 3/4, not the 1/4 hiding inside the word "quarters".
   "two quarters" is the same amount as a half. "one over two" is 1/2.
   A bare "half" or "quarter" is still one of them. */
function fracs(s) {
  const t = String(s || '').toLowerCase().replace(/\s*\/\s*/g, '/');
  const out = [];
  let masked = t;
  const eat = (re, build) => {
    masked = masked.replace(re, (m, a, b) => {
      const v = build(m, a, b);
      if (v) out.push(v);
      return ' '.repeat(m.length);
    });
  };
  eat(/\d+\/\d+/g, m => m);
  eat(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+over\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/g, (m, a, b) => {
    const n = countOf(a), d = countOf(b);
    return n && d ? n + '/' + d : null;
  });
  eat(/\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(halves|half|thirds|third|quarters|quarter|fourths|fourth|fifths|fifth|sixths|sixth|eighths|eighth|ninths|ninth|tenths|tenth|twelfths|twelfth)\b/g, (m, a, b) => {
    const n = countOf(a), d = DENOM_WORD[b];
    return n && d ? n + '/' + d : null;
  });
  (masked.match(/[a-z]+/g) || []).forEach(w => { if (WORD_FRAC[w]) out.push(WORD_FRAC[w]); });
  return out;
}
function fractionValues(s) {
  const out = [];
  fracs(s).forEach(f => { const v = fracValue(f); if (v != null) out.push(v); });
  return out;
}
/* The one amount a question's points are naming, if they agree.
   "says three quarters" is 3/4. A point with no fraction is not an amount. */
function expectedFractionValue(points) {
  const vals = [];
  for (const p of points) {
    const vs = fractionValues(p);
    if (vs.length === 1) vals.push(vs[0]);
  }
  const uniq = [...new Set(vals)];
  return uniq.length === 1 ? uniq[0] : null;
}
/* The one whole number a non-fraction question works out to.
   Taken from the mark point when it names the result, otherwise from the sum itself. */
function expectedNumber(question, points) {
  const q = String(question || '');
  if (/\d\s*\/\s*\d/.test(q) || fractionValues((points || []).join(' ')).length) return null;
  const asked = nums(q);
  const spare = [];
  for (const p of points || []) nums(p).forEach(n => { if (!asked.includes(n)) spare.push(n); });
  const res = arith(q);
  if (res != null && isFinite(res)) spare.push(String(Number(res)));
  const uniq = [...new Set(spare)];
  return uniq.length === 1 ? uniq[0] : null;
}
/* "I think" and "not sure" are not a firm answer. The number may still be right,
   and the card can still show it, but it does not count as "got them all". */
function isHedged(s) {
  return /\b(i\s+think|not\s+sure|maybe|dunno|don'?t\s+know|i\s+guess)\b/i.test(String(s || ''));
}

/* Which thing is being called bigger or smaller. "1/2 because 2 is smaller" is NOT the
   pupil saying 1/2 is smaller - the thing being called smaller is "2", the denominator,
   and the 1/2 is the answer they gave before they explained. A connective starts a new
   clause, so the subject of the comparison is what comes AFTER the last one - never a
   fraction borrowed from the clause before it.
   Without this, "1/2 because 2 is smaller" was read as "1/2 is smaller", which contradicted
   the point "1/2 is bigger" - and a contradiction voids the WHOLE question, so a pupil who
   answered correctly and explained correctly scored 0 out of 2. */
const CLAUSE_BREAK = /\b(?:because|since|so|but|then|whereas|however|therefore|although|though)\b/gi;
function subjectOf(phrase) {
  const s = String(phrase || '');
  const re = new RegExp(CLAUSE_BREAK.source, 'gi');
  let last = -1, m;
  while ((m = re.exec(s))) last = m.index + m[0].length;
  return last < 0 ? s : s.slice(last);
}
/* "4/5 is bigger than 3/4" means 4/5 is the answer. The first fraction in the phrase is
   the one being called the bigger (or smaller) one; anything after "than" is what it is
   being compared against. */
function claim(text) {
  const m = String(text || '').match(/([^,;.:!?]{0,24}?)\s+(?:is|are)\s+(?:the\s+)?(bigger|larger|greater|more|smaller|less|biggest|largest|smallest)\b/i);
  if (!m) return null;
  const f = fracs(subjectOf(m[1]));
  if (!f.length) return null;
  return { win: f[0], dir: /^(?:smaller|less|smallest)$/i.test(m[2]) ? 'less' : 'more' };
}

/* 3/4 as a number, so 2/4 and 1/2 count as the same answer. */
function fracValue(fr) {
  const m = String(fr || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const v = Number(m[1]) / Number(m[2]);
  return isFinite(v) ? Math.round(v * 10000) / 10000 : null;
}

/* Every fraction the pupil calls bigger or smaller, in their own words. */
function saidAs(text) {
  const t = String(text || '').toLowerCase().replace(/\s*\/\s*/g, '/');
  const out = [];
  /* "X is bigger than Y" also says something about Y - that it is the SMALLER one. An
     earlier version read only the fraction before the comparison word, so "one tenth is
     bigger than one fifth" came back "1/5 is more", the opposite of what the pupil said,
     and the clash check below therefore never fired on a child who had it backwards.
     Reading the phrase after "than" as the opposite direction fixes that. */
  const re = /([^,;.:!?]{0,24}?)\s+(?:is|are)\s+(?:the\s+)?(bigger|larger|greater|more|smaller|less)\b(?:\s+than\s+([^,;.:!?]{0,24}))?/g;
  let m;
  while ((m = re.exec(t))) {
    const dir = /^(?:smaller|less)$/.test(m[2]) ? 'less' : 'more';
    const f = fracs(subjectOf(m[1]));
    if (f.length) out.push({ f: f[0], dir });
    if (m[3]) {
      const opp = dir === 'more' ? 'less' : 'more';
      fracs(m[3]).forEach(x => out.push({ f: x, dir: opp }));
    }
  }
  return out;
}

/* Typing the question back is not an answer, however tidy it looks: every content word
   in the answer was already in the question, and they added nothing of their own. Ratios
   were tried first and misfired twice: "and tell you how I know" (Freyas own tweak) read
   as their own words, and a genuine "tell them a tenth is smaller" read as the question.
   A pupil who adds one content word of their own is not echoing. */
const STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'its', 'this', 'that', 'these', 'those', 'and', 'or', 'but', 'so', 'if', 'then', 'than',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'you', 'your', 'i', 'me', 'my', 'we', 'us',
  'our', 'he', 'she', 'they', 'them', 'can', 'could', 'would', 'should', 'do', 'does', 'did',
  'have', 'has', 'had', 'what', 'which', 'who', 'how', 'why', 'when', 'where', 'know', 'tell',
  'say', 'says', 'said', 'not', 'no', 'yes', 'there', 'here', 'well', 'just', 'really']);
function echoWords(x) {
  let t = String(x || '').toLowerCase().replace(/\s*\/\s*/g, '/');
  /* ten and 10 are the same word to a child, and to this test */
  t = t.replace(/\b[a-z]+\b/g, w => (WORD_NUM[w] !== undefined ? ' ' + WORD_NUM[w] + ' ' : w));
  return t.replace(/[^a-z0-9/\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function isEcho(answer, question) {
  const all = echoWords(answer);
  if (all.length < 4) return false;
  const mine = all.filter(w => !STOP_WORDS.has(w));
  if (!mine.length) return false;
  const asked = new Set(echoWords(question));
  return mine.every(w => asked.has(w));
}

/* A bare right or wrong amount does not need a model. The value check below
   credits a right amount and voids a wrong one, including the method point.
   A why, a hedge, or an explanation still goes to the model. */
function clearCutAnswer(question, points, answer) {
  const q = String(question || '');
  const a = String(answer || '').trim();
  if (!a || /why|explain|how do you know|how can you tell/i.test(q)) return null;
  if (isHedged(a) || /\b(because|since)\b/i.test(a)) return null;
  const words = a.split(/\s+/).filter(Boolean);
  if (words.length > 8) return null;
  const expF = expectedFractionValue(points);
  const expN = expF == null ? expectedNumber(q, points) : null;
  if (expF == null && expN == null) return null;
  if (expF != null) {
    const vals = fractionValues(a);
    if (!vals.length) return null;
    const qVals = fractionValues(q);
    const has = vals.some(v => v === expF);
    const onlyExpected = vals.every(v => v === expF || qVals.some(n => n === v));
    if (has && onlyExpected) return 'right';
    if (!has && words.length <= 6) return 'wrong';
    return null;
  }
  const ns = nums(a);
  if (!ns.length) return null;
  const asked = nums(q);
  const has = ns.includes(expN);
  const onlyExpected = ns.every(n => n === expN || asked.includes(n));
  if (has && onlyExpected) return 'right';
  if (!has && words.length <= 4) return 'wrong';
  return null;
}

async function markAnswer(system, answer, model, maxTokens) {
  const raw = await llm([
    { role: 'system', content: system },
    { role: 'user', content: 'The pupil answered: ' + answer }
  ], { json: true, temperature: 0, model, maxTokens });
  return parseJson(raw);
}

/* Flash is the expensive model. Use it only when Flash-Lite was unsure:
   some but not all of the points, or a real explanation that scored nothing. */
function wantsFlashOpinion(o, lo, hi, question, answer) {
  const total = hi - lo;
  if (total <= 0 || !o) return false;
  const shown = new Set();
  if (Array.isArray(o.shown)) o.shown.forEach(n => {
    const i = Number(n) - 1;
    if (i >= lo && i < hi) shown.add(i);
  });
  if (shown.size > 0 && shown.size < total) return true;
  const why = /why|explain|how do you know|how can you tell/i.test(question || '');
  const words = String(answer || '').trim().split(/\s+/).filter(Boolean).length;
  return why && words >= 8 && shown.size === 0;
}

/* WW2, WWII, World War Two and the Second World War are one answer. The marker was
   treating the second wording as a separate point and then marking "WW2" wrong against
   it. Fold the known names onto one token so a later check can see they match. */
function canonText(s) {
  let t = String(s || '').toLowerCase().replace(/[’']/g, '');
  t = t.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/\bworld war (?:two|2|ii)\b/g, 'ww2');
  t = t.replace(/\bsecond world war\b/g, 'ww2');
  t = t.replace(/\bwwii\b/g, 'ww2');
  t = t.replace(/\bww ii\b/g, 'ww2');
  t = t.replace(/\bworld war (?:one|1|i)\b/g, 'ww1');
  t = t.replace(/\bfirst world war\b/g, 'ww1');
  t = t.replace(/\bgreat war\b/g, 'ww1');
  t = t.replace(/\bwwi\b/g, 'ww1');
  t = t.replace(/\bww i\b/g, 'ww1');
  t = t.replace(/\bunited nations\b/g, 'un');
  t = t.replace(/\bunited kingdom\b/g, 'uk');
  t = t.replace(/\bgreat britain\b/g, 'uk');
  t = t.replace(/\bbritain\b/g, 'uk');
  return ' ' + t + ' ';
}
function foldIdeas(text) {
  const t = canonText(text);
  const ids = [];
  if (/\bww2\b/.test(t)) ids.push(0);
  if (/\bww1\b/.test(t)) ids.push(1);
  if (/\bun\b/.test(t)) ids.push(2);
  if (/\buk\b/.test(t)) ids.push(3);
  return ids;
}
function stripIdeaPhrases(text, ideas) {
  let t = String(text || '');
  if (ideas.includes(0)) t = t.replace(/\b(?:world war (?:two|2|ii)|second world war|wwii|ww\s*ii|ww2)\b/gi, ' ');
  if (ideas.includes(1)) t = t.replace(/\b(?:world war (?:one|1|i)|first world war|great war|wwi|ww\s*i)\b/gi, ' ');
  if (ideas.includes(2)) t = t.replace(/\bunited nations\b/gi, ' ');
  if (ideas.includes(3)) t = t.replace(/\b(?:united kingdom|great britain|britain|u\.k\.|uk)\b/gi, ' ');
  return t;
}
const ALIAS_GLUE = new Set(['called', 'known', 'also', 'named', 'name', 'means', 'referred', 'aka', 'another', 'word', 'same', 'simply', 'just', 'nickname', 'short']);
function stemWord(w) { return String(w || '').replace(/s$/, ''); }
/* The point names a thing, and the answer names the same thing another way, with no
   extra fact left over. "WW2" shows "it was called World War Two" once the question's
   own words are ignored. It does not show "Britain joined because Germany invaded
   Poland", because that point still has words the answer never said. */
function aliasHitsPoint(point, answer, question) {
  const ideas = foldIdeas(point);
  if (!ideas.length) return false;
  const ans = foldIdeas(answer);
  if (!ideas.every(i => ans.includes(i))) return false;
  const qset = new Set(echoWords(question).filter(w => !STOP_WORDS.has(w)).map(stemWord));
  const mine = new Set(echoWords(answer).filter(w => !STOP_WORDS.has(w)).map(stemWord));
  const rest = echoWords(stripIdeaPhrases(point, ideas))
    .filter(w => !STOP_WORDS.has(w) && !ALIAS_GLUE.has(w))
    .map(stemWord)
    .filter(w => w.length > 1 && !qset.has(w));
  return rest.every(w => mine.has(w));
}
function aliasOnly(point) {
  const ideas = foldIdeas(point);
  if (ideas.length !== 1) return false;
  const rest = echoWords(stripIdeaPhrases(point, ideas)).filter(w => !STOP_WORDS.has(w) && !ALIAS_GLUE.has(w) && w.length > 2);
  return rest.length === 0;
}
function collapseAliasDupes(list) {
  const kept = [];
  for (const p of list) {
    const ideas = foldIdeas(p);
    const dup = ideas.length && kept.some(k => {
      const ki = foldIdeas(k);
      if (!ki.length || ki.length !== ideas.length) return false;
      return ideas.every(i => ki.includes(i)) && aliasOnly(p) && aliasOnly(k);
    });
    if (!dup) kept.push(p);
  }
  return kept;
}
/* Stored schemes already on live checks still carry the padded second point. Drop it
   here, when the card is built, so a pupil marked today is not scored against a fact
   the question never asked. Why and how questions keep their separate reasons. */
function fitMarks(question, points) {
  let list = (points || []).map(p => String(p || '').trim()).filter(Boolean);
  list = collapseAliasDupes(list);
  if (asksOneFact(question) || shortFact(question)) list = list.slice(0, 1);
  return list;
}
function contentStems(s) {
  return echoWords(s).filter(w => !STOP_WORDS.has(w) && w.length > 2).map(stemWord);
}
function bareAmount(s) {
  const v = String(s || '').trim().toLowerCase();
  if (!v) return false;
  if (/^[\s\d\/.,+-]+$/.test(v)) return true;
  const words = v.split(/[\s-]+/).filter(Boolean);
  const filler = /^(?:and|a|an|the)$/;
  return words.length > 0 && words.length <= 4 && words.every(w => WORD_NUM[w] !== undefined || filler.test(w) || /^\d+(?:\/\d+)?$/.test(w));
}
/* One quote was ticking a second point it does not contain: "towns/cities" credited
   "targeted cities and industrial areas". When the same answer is the evidence for two
   points, each point has to be visible in that answer. A sum's bare number is left
   alone, because "15" really does show both "says 15" and "adds 7 and 8". */
function dropUndemonstrated(marks, questions, hit, offset) {
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (ps.length < 2) continue;
    const q = (questions && questions[qi]) || '';
    const lo = offset[qi];
    const expF = expectedFractionValue(ps);
    const expN = expF == null ? expectedNumber(q, ps) : null;
    if (expF != null || expN != null) continue;
    if (ps.some((_, k) => bareAmount(hit.get(lo + k) || ''))) continue;
    const norm = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const quotes = ps.map((_, k) => hit.get(lo + k) || '');
    for (let k = 0; k < ps.length; k++) {
      if (!quotes[k]) continue;
      const shared = quotes.some((other, j) => j !== k && other && norm(other) === norm(quotes[k]));
      if (!shared) continue;
      const have = new Set(contentStems(quotes[k]));
      const parts = String(ps[k]).split(/\s+\band\b\s+/i).map(x => x.trim()).filter(part => contentStems(part).length);
      const need = contentStems(ps[k]);
      const shown = parts.length >= 2
        ? parts.every(part => contentStems(part).some(w => have.has(w)))
        : (!need.length || need.some(w => have.has(w)));
      if (!shown) hit.delete(lo + k);
    }
  }
}
function tidyFact(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '');
  t = t.replace(/^(says|states|explains|knows|names|shows)\s+/i, '');
  if (t.length > 90) t = t.slice(0, 87).replace(/\s+\S*$/, '');
  return t;
}
/* The NEXT line was a second copy of the summary. Teachers need the gap: which
   question, and the fact that was missing. Complete misses come first, then a
   question that was only partly there. Two gaps is enough to act on. */
function nextStepFromGaps(evidence) {
  const gaps = [];
  for (const e of evidence || []) {
    const points = e.points || [];
    const missed = points.filter(p => !p.hit).map(p => tidyFact(p.t)).filter(Boolean);
    if (missed.length) gaps.push({
      q: String(e.q || '').replace(/\?+$/, '').trim(),
      missed,
      all: points.length > 0 && missed.length === points.length
    });
  }
  if (!gaps.length) return 'Move on. These answers cover what the questions asked.';
  const ordered = gaps.filter(g => g.all).concat(gaps.filter(g => !g.all)).slice(0, 2);
  const bit = (g, n) => {
    const facts = g.missed.slice(0, n).join('; ');
    if (!g.q) return facts;
    const lead = g.q.charAt(0).toLowerCase() + g.q.slice(1);
    return lead + ' (' + facts + ')';
  };
  /* Two missing facts per question when they fit. If that runs long, keep one
     fact each so the line is never cut off in the middle of a point. */
  let line = 'Recap ' + ordered.map(g => bit(g, 2)).join(', and ') + '.';
  if (line.length > 420) line = 'Recap ' + ordered.map(g => bit(g, 1)).join(', and ') + '.';
  return line.replace(/[\u2014\u2013]/g, ',');
}

async function marksFromAnswers(topic, marks, transcript, questions, year) {
  marks = (marks || []).map((m, i) => fitMarks((questions && questions[i]) || '', m));
  const points = [].concat.apply([], marks).filter(Boolean);
  if (!points.length) return null;
  const turns = [];
  for (const line of transcript.split('\n')) {
    const m = line.match(/^(Student|Examiner):\s*(.*)$/);
    if (m) turns.push({ role: m[1].toLowerCase(), text: m[2].trim() });
    else if (turns.length) turns[turns.length - 1].text += ' ' + line.trim();
  }
  const answers = turns.filter(t => t.role === 'student' && t.text).map(t => t.text);
  if (!answers.length) return null;
  /* One answer belongs to one question, so an answer can only ever show that question's
     points. Judging every answer against every point let a pupil's answer to Q4 be quoted
     on the card as the evidence for a point on Q3 - which reads, to a teacher, as a mark
     that made itself up. Where the counts line up, the marker is handed only that
     question's points. Where the examiner dug (more answers than questions) they cannot be
     paired, so it falls back to the whole list.
     The numbering stays global so a point keeps its identity. */
  const offset = [];
  let run = 0;
  for (const m of marks) { offset.push(run); run += (m || []).filter(Boolean).length; }
  /* The examiner digs on a weak answer, so a transcript can hold MORE answers than the
     check has questions - and then counting cannot pair them, the nets switch off, and a
     pupil who answered every question came back 0 of 10 with "nothing" against each one.
     The questions are known, so find each one in the transcript and take the answer that
     follows it. A follow-up is not on the list, so it is passed over. */
  if (answers.length !== marks.length && Array.isArray(questions) && questions.length === marks.length) {
    const found = [];
    let at = 0;
    for (const q of questions) {
      const want = String(q || '').trim();
      /* The first turn carries the greeting ("Hi there! Which is bigger..."), so the turn
         text is the question with something in front of it - an exact match missed it, the
         pairing failed, and the answered question lost its marker. Look for the question
         INSIDE the turn instead. */
      const idx = turns.findIndex((t, i) => i >= at && t.role === 'examiner' && want && t.text.includes(want));
      if (idx < 0) { found.length = 0; break; }
      const a = turns[idx + 1];
      found.push(a && a.role === 'student' ? a.text : '');
      /* Move past the QUESTION, not past the answer. When a pupil skips a question the
         turn after it is the NEXT question, and stepping to idx + 2 jumped clean over it -
         so the following question could never be found, the pairing failed, and the whole
         transcript lost its marker. A pupil who skipped Q1 and answered Q2 well was marked
         only by the number nets. Stepping to idx + 1 still cannot re-match the question we
         just used, because that sits at idx. */
      at = idx + 1;
    }
    if (found.length === questions.length) {
      answers.length = 0;
      found.forEach(x => answers.push(x));
    }
  }
  const paired = answers.length === marks.length;
  /* The year group is OPTIONAL and set once on the class. It never touches whether an
     answer is right - a right answer is right at any age. It only moves the bar for
     whether a pupil said WHY, which is the one thing that really does differ between a
     nine-year-old and a seventeen-year-old. */
  const yearNote = year
    ? 'The class is ' + year + '. Pitch the "reason" flag to that. A younger pupil may show they get it in very few words and that still counts as a reason. An older pupil should be expected to say why, so a bare answer from them is more likely reason=false. Never change whether the ANSWER is right because of the age - only how much explaining you expect.'
    : '';
  const sysFor = (lo, hi) => `Topic: "${topic}".
Which of these points does this ONE answer show? Strict on the meaning, generous on spelling and on other names for the same thing.
${points.map((p, i) => ({ n: i + 1, p })).filter(x => x.n - 1 >= lo && x.n - 1 < hi).map(x => x.n + '. ' + x.p).join('\n')}
Tick a point only when this answer actually says that point. The same words cannot be the evidence for a different point. "towns and cities" does not show "industrial areas". A person's name does not show an extra fact the pupil did not say.
Abbreviations and other names for the same thing count. WW2, WWII, World War 2, World War Two and the Second World War are the same answer.
A right amount ticks the point that names that amount, and the method point that got it there. "3/4" for 1/4 + 1/2 ticks "says three quarters" and "adds the top numbers". A bare number never ticks a why or explain point. A point that only names the claim ("1/2 is bigger") is ticked by that claim. A point that asks why is not.
reason is true only when they explain why, however short. A bare amount is reason false.
${yearNote}
Return ONLY JSON: {"shown":[1],"reason":false}`;
  /* Which answer showed each point, not merely whether it was shown somewhere. Keeping
     the answer is what lets the card print the child's own words under the point they
     earned - so the teacher can agree or disagree from the evidence instead of from the
     colour. The words are quoted, never summarised. */
  const hit = new Map();
  let reasonYes = 0;
  const whyReason = questions.map(() => false);
  for (let k = 0; paired && k < answers.length; k++) {
    const a = answers[k];
    const lo = paired ? offset[k] : 0;
    const hi = paired ? offset[k] + (marks[k] || []).filter(Boolean).length : points.length;
    if (paired && !(hi > lo)) continue;
    /* A question the pupil skipped has no answer. There is nothing to mark, so do not ask
       the model - an empty answer should never be the thing that ticks a point. */
    if (!String(a || '').trim()) continue;
    /* nothing of their own to mark */
    if (isEcho(a, paired ? questions[k] : questions.join(' '))) continue;
    try {
      const cut = paired ? clearCutAnswer(questions[k], (marks[k] || []).filter(Boolean), a) : null;
      let o = cut ? { shown: [], reason: false, skip: cut } : null;
      if (!cut) {
        const lite = cfg.model;
        const flash = cfg.verdictModel || cfg.model;
        o = await markAnswer(sysFor(lo, hi), a, lite, 100);
        if (o && flash !== lite && wantsFlashOpinion(o, lo, hi, paired ? questions[k] : '', a)) {
          const second = await markAnswer(sysFor(lo, hi), a, flash, 400);
          if (second && Array.isArray(second.shown)) o = second;
        }
      }
      if (o && o.reason === true) { reasonYes++; if (paired) whyReason[k] = true; }
      if (!cut && o && Array.isArray(o.shown)) o.shown.forEach(n => {
        const i = Number(n) - 1;
        if (i >= 0 && i < points.length && !hit.has(i)) hit.set(i, a);
      });
    } catch (e) { logError('/api/verdict marks', e.message); }
  }
  /* A comparison question offers two things and the pupil picks one: "1/2 or 1/4?" -> "1/2".
     The point is worded as the CLAIM - "1/2 is bigger" - so the marker waits for the word
     "bigger", ticks nothing, and the safety net below cannot help because the question
     itself asked about 1/2. The pupil did answer, though: picking one of two offered values
     IS the whole of the answer. So where the question offers two or more values and the
     answer names exactly one of them, tick the point that names that same value. Exactly
     one - naming both is not a choice, and naming the other one is simply wrong, so a wrong
     pick still earns nothing. */
  if (paired) {
    const esc = v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let k = 0; k < answers.length; k++) {
      const offered = (String(questions[k] || '').match(/\d+\s*\/\s*\d+|\d+\.\d+/g) || []).map(s => s.replace(/\s+/g, ''));
      if (offered.length < 2) continue;
      const flat = String(answers[k]).replace(/\s+/g, '');
      const named = offered.filter(v => new RegExp('(^|[^0-9/.])' + esc(v) + '($|[^0-9/.])').test(flat));
      if (named.length !== 1) continue;
      (marks[k] || []).forEach((p, n) => {
        if (!p) return;
        const i = offset[k] + n;
        if (hit.has(i)) return;
        if (String(p).replace(/\s+/g, '').indexOf(named[0]) >= 0) hit.set(i, answers[k]);
      });
    }
  }
  /* A safety net under the marker, for the one case it keeps getting wrong. The teacher
     writes "The sum of 15 and 23 is 38" and a pupil who is right answers "38". The model
     reads the point as a sentence the pupil has to SAY, decides "38" is not that sentence,
     and marks it no - so a child who got every sum right comes back on 5 of 10. They
     missed nothing; the marking did.
     So: a point that names a number the QUESTION itself never asked is the answer to that
     question. If the pupil typed that number, they showed it, whatever words the teacher
     wrapped round it. Deterministic, and it cannot over-credit: a wrong answer carries the
     wrong number, or none. */
  /* Both nets work QUESTION BY QUESTION, on the points that belong to each question, so
     they need no pairing between answers and questions at all. A follow-up question the
     examiner asks ("What is 10 + 5?") leaves more answers than questions; pairing then
     fails, and the old nets either switched off (every sum came back "no") or swept every
     question with one answer's number ("23" quoted under "subtracts 12 from 30"). Working
     per question cannot do either: a question's points are only ever touched by an answer
     that carries that question's own number. */
  /* A wrong amount cannot keep a mark, including the working point the model ticks
     beside it. "1/4" is not "one half", and it is not "adds the top numbers" either.
     The same pass credits an amount said another way: "two quarters" is a half,
     "3/4" is three quarters. Run again after the wording nets, which can put a
     point back onto an answer the value has already ruled out. */
  if (paired) reconcileAnswerValues(answers, marks, questions, hit, offset);
  /* Was this answer JUST a value - a bare "12", a "3/8", or the same number said out loud
     as a word? nums() already reads number words, but this test was digits-only, so a pupil
     who SPOKE their answer ("Twelve", "Seven", "Fourteen") was treated as if they had
     written a sentence. The nets below that credit the operation beside a bare number then
     never fired, and they lost the working point the typed pupil kept - same answers,
     different marks, purely because of the spelling. */
  const BARE_FILLER = /^(?:and|a|an)$/;
  const isBareValue = (s) => {
    const v = String(s || '').trim().toLowerCase();
    if (!v) return false;
    if (/^[\s\d\/.,+-]+$/.test(v)) return true;
    const words = v.split(/[\s-]+/).filter(Boolean);
    return words.length > 0 && words.every(w => WORD_NUM[w] !== undefined || BARE_FILLER.test(w));
  };
  const bare = answers.filter(isBareValue);
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
    const lo = offset[qi];
    const asked = nums((questions && questions[qi]) || '');
    for (let k = 0; k < ps.length; k++) {
      if (hit.has(lo + k)) continue;
      const spare = nums(ps[k]).filter(n => !asked.includes(n));
      if (!spare.length) continue;
      /* the pupil's answer must BE one number. "3/8" is two ("3" and "8"), and matching
         it on the "3" alone ticked "says 3/4" - a child who added the bottoms came back
         green off the back of one shared digit. */
      const m = bare.find(a => nums(a).length === 1 && spare.includes(nums(a)[0]));
      if (m) hit.set(lo + k, m);
    }
  }
  /* Short-fact net. "What is the first letter in 'apple'?" and "Spell the word 'cat'."
     The right answer is worked out from the question itself, so a pupil who gives it is
     credited on every point that question has - they answered what was asked, in the
     shortest way it can be answered, and that is not a reason to mark them down. */
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
    const lo = offset[qi];
    const want = shortAnswer((questions && questions[qi]) || '');
    if (!want) continue;
    const wantN = want.map(normAns).filter(Boolean);
    const mine = answers.find(a => wantN.includes(normAns(a)));
    if (!mine) continue;
    for (let k = 0; k < ps.length; k++) if (!hit.has(lo + k)) hit.set(lo + k, mine);
  }
  /* Result net: work the answer out in code. If the question is a simple sum and the child
     gave that number as a bare answer, credit the question's answer point - even when the
     mark points only describe the operation ("multiplies 4 by 2" / "adds 7 and 7"), which
     carry only the operands and never the result. No pairing needed; the number is worked
     out from the question itself, so a wrong answer is never credited. */
  const OP_WORD = /\b(add|adds|added|subtract\w*|take\w*\s+away|plus|minus|multipl\w*|divid\w*|count\w*|remove\w*|leaves|combine\w*|total)\b/i;
  {
    const used = new Set([...hit.values()]);
    for (let qi = 0; qi < marks.length; qi++) {
      const ps = (marks[qi] || []).filter(Boolean);
      if (!ps.length) continue;
      const lo = offset[qi];
      const res = arith((questions && questions[qi]) || '');
      if (res == null || !isFinite(res)) continue;
      const want = String(Number(res));
      const m = bare.find(a => nums(a).includes(want) && !used.has(a)) || bare.find(a => nums(a).includes(want));
      if (!m) continue;
      used.add(m);
      for (let k = 0; k < ps.length; k++) {
        if (!hit.has(lo + k) && OP_WORD.test(ps[k])) { hit.set(lo + k, m); break; }
      }
    }
  }
  /* The working point beside a sum's answer. If a question's answer point was shown by a
     bare number, the operation was done, so the working point on that SAME question is
     shown too - the same child's number, on their own question. A why-question's answer is
     never bare, so nothing is added there. */
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
    const lo = offset[qi];
    let quote = null;
    for (let k = 0; k < ps.length; k++) {
      const h = hit.get(lo + k);
      if (h == null) continue;
      const wholeFraction = echoWords(h).length <= 3 && fracs(h).length === 1;
      if (isBareValue(h) || wholeFraction) { quote = h; break; }
    }
    if (!quote) continue;
    for (let k = 0; k < ps.length; k++) {
      if (!hit.has(lo + k) && OP_WORD.test(ps[k])) hit.set(lo + k, quote);
    }
  }
  /* A pupil who names the WRONG fraction has not shown the point that names the right
     one, and the marker does not read direction: it ticks "4/5 is bigger than 3/4" for a
     child who wrote "3/4 is bigger", and ticks "a fifth is bigger than a tenth" for a
     child who wrote that a tenth is. So read the direction in code. Only fractions that
     appear in the point count, so a pupil working with sub-parts ("a quarter is bigger
     than a fifth") is left alone - and a contradiction voids the whole question, because
     the pupil answered the opposite of what was asked. */
  if (paired) {
    for (let qi = 0; qi < marks.length; qi++) {
      const ps = (marks[qi] || []).filter(Boolean);
      if (!ps.length) continue;
      const said = saidAs(answers[qi] || '');
      if (!said.length) continue;
      let wrong = false;
      for (const point of ps) {
        const c = claim(point);
        if (!c) continue;
        const inPoint = fracs(point);
        for (const s of said) {
          if (!inPoint.includes(s.f)) continue;
          if ((s.f === c.win) !== (s.dir === c.dir)) { wrong = true; break; }
        }
        if (wrong) break;
      }
      if (wrong) for (let k = offset[qi]; k < offset[qi] + ps.length; k++) hit.delete(k);
    }
  }
  /* Wording net. The marker reads meaning, and now and then misses a point the pupil has
     said almost word for word - "the order does not matter in timesing" against "explains
     the order does not matter" came back as a miss, so a pupil who had said it came back
     amber. If every real word of the point is in the answer, they have said it. Two
     content words at least, so a one-word point cannot be matched by accident. */
  {
    const LEAD = /^(explains?|says?|states?|shows?|knows?|uses?|gives?|writes?|names?|mentions?|recognises?|recognizes?|tells?)\s+/i;
    const stem = w => w.replace(/s$/, '');
    for (let qi = 0; qi < marks.length; qi++) {
      const ps = (marks[qi] || []).filter(Boolean);
      if (!ps.length) continue;
      const lo = offset[qi];
      const q = (questions && questions[qi]) || '';
      for (let k = 0; k < ps.length; k++) {
        if (hit.has(lo + k)) continue;
        const need = echoWords(ps[k].replace(LEAD, '')).filter(w => !STOP_WORDS.has(w)).map(stem);
        if (need.length < 2) continue;
        for (const a of answers) {
          if (isEcho(a, paired ? q : questions.join(' '))) continue;
          const mine = new Set(echoWords(a).map(stem));
          if (need.every(w => mine.has(w))) { hit.set(lo + k, a); break; }
        }
      }
    }
  }
  /* A bare result is not a reason. On a WHY question, "its 10 either way" shows the pupil
     knows the fact but not why it is true, and the marker ticks the reasons anyway - so a
     pupil who explained nothing came back green. Very short, carries a number, and not one
     word of reasoning: one point, not two. Deliberately narrow, so a pupil explaining it
     their own way is never caught by it. */
  for (let qi = 0; qi < marks.length; qi++) {
    const q = (questions && questions[qi]) || '';
    if (!/why|explain/i.test(q)) continue;
    const a = paired ? (answers[qi] || '') : '';
    if (!a || a.trim().split(/\s+/).length > 4) continue;
    if (!/\d/.test(a)) continue;
    if (/because|since|\bso\b|\bsame\b|order|swap|group|repeat|doubl|equal|both|times|mean/i.test(a)) continue;
    const ps = (marks[qi] || []).filter(Boolean).length;
    if (ps < 2) continue;
    const hs = [];
    for (let k = 0; k < ps; k++) if (hit.has(offset[qi] + k)) hs.push(offset[qi] + k);
    if (hs.length > 1) hs.slice(1).forEach(x => hit.delete(x));
  }
  if (paired) reconcileAnswerValues(answers, marks, questions, hit, offset);
  /* Synonyms the model still misses. "WW2" against "called World War Two" is the
     answer, even when the model waits for those exact words. */
  if (paired) {
    for (let qi = 0; qi < marks.length; qi++) {
      const ps = (marks[qi] || []).filter(Boolean);
      const a = answers[qi] || '';
      if (!ps.length || !String(a).trim()) continue;
      const lo = offset[qi];
      for (let k = 0; k < ps.length; k++) {
        if (hit.has(lo + k)) continue;
        if (aliasHitsPoint(ps[k], a, (questions && questions[qi]) || '')) hit.set(lo + k, a);
      }
    }
  }
  dropUndemonstrated(marks, questions, hit, offset);
  /* The BAND comes from the QUESTIONS the pupil showed something on, not from the pooled
     points. Both earlier rules failed the same way: per-question voting let a one-point
     question read green, and the pooled share parked a pupil on 36% - a number no teacher
     can call amber or red. Points are still counted, and still shown, as detail. */
  const evidence = [];
  let base = 0, hitPool = 0, allPool = 0, blanks = 0, answered = 0, valueQs = 0, valueFirm = 0, valueWrong = 0, valueHedged = 0;
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
    if (paired) {
      const said = answers[qi] || '';
      if (String(said).trim()) answered++;
      const expF = expectedFractionValue(ps);
      const expN = expF == null ? expectedNumber((questions && questions[qi]) || '', ps) : null;
      if (expF != null || expN != null) {
        valueQs++;
        const has = expF != null ? fractionValues(said).some(v => v === expF) : nums(said).includes(expN);
        if (!has) valueWrong++;
        else if (isHedged(said)) valueHedged++;
        else valueFirm++;
      }
    }
    const got = ps.filter((_, k) => hit.has(base + k)).length;
    if (!got) blanks++;
    hitPool += got;
    allPool += ps.length;
    evidence.push({
      q: String((questions && questions[qi]) || '').trim(),
      level: got === ps.length ? 'green' : got >= 1 ? 'amber' : 'red',
      got, total: ps.length,
      points: ps.map((t, k) => ({
        t: String(t),
        hit: hit.has(base + k),
        said: hit.has(base + k) ? clip(hit.get(base + k), 180) : ''
      }))
    });
    base += ps.length;
  }
  if (!evidence.length) return null;
  const qCount = evidence.length;
  const shownQs = evidence.filter(e => e.got > 0).length;
  const fullQs = evidence.filter(e => e.got >= e.total).length;
  /* Every checkable answer wrong is red, even if one why-question picked up a stray
     point. Every checkable answer firmly right is green: green follows the answer.
     A hedged answer ("I think", "not sure") is not firm, so it stays in the middle
     unless the questions themselves were shown. Anything else is unchanged:
     nothing shown is red, something on every question is green, the rest amber. */
  const allWrong = valueQs > 0 && valueWrong === valueQs;
  const allFirm = valueQs > 0 && valueFirm === valueQs;
  const level = allWrong ? 'red'
    : allFirm ? 'green'
    : !shownQs ? 'red'
    : (shownQs === qCount && !valueHedged) ? 'green'
    : 'amber';
  const whyQs = (questions || []).map((q, i) => (/why|explain|how do you know|how can you tell/i.test(q || '') ? i : -1)).filter(i => i >= 0);
  const reason = whyQs.length ? whyQs.every(i => whyReason[i]) : reasonYes >= qCount;
  return {
    level, hit: hitPool, total: allPool, blanks, shown: shownQs, qs: qCount, full: fullQs,
    reason, evidence, answered, valueQs, valueFirm, valueWrong, valueHedged
  };
}

/* Credit an answer that states the right amount, and take every point back off an
   answer that states a different one. Working points go with the amount: a wrong
   fraction is not evidence that the pupil added the tops. */
function reconcileAnswerValues(answers, marks, questions, hit, offset) {
  const OP = /\b(add|adds|added|subtract\w*|take\w*\s+away|plus|minus|multipl\w*|divid\w*|count\w*|remove\w*|leaves|combine\w*|total)\b/i;
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
    const lo = offset[qi];
    const a = answers[qi] || '';
    const expF = expectedFractionValue(ps);
    const expN = expF == null ? expectedNumber((questions && questions[qi]) || '', ps) : null;
    if (expF == null && expN == null) continue;
    const contains = expF != null
      ? fractionValues(a).some(v => v === expF)
      : nums(a).includes(expN);
    if (!contains) {
      for (let k = 0; k < ps.length; k++) hit.delete(lo + k);
      continue;
    }
    for (let k = 0; k < ps.length; k++) {
      if (hit.has(lo + k)) continue;
      if (expF != null) {
        const theirs = fractionValues(ps[k]);
        if (theirs.length === 1 && theirs[0] !== expF) continue;
        if ((theirs.length === 1 && theirs[0] === expF) || OP.test(ps[k])) hit.set(lo + k, a);
      } else if (nums(ps[k]).includes(expN) || OP.test(ps[k])) hit.set(lo + k, a);
    }
  }
}

/* The count and the whole-transcript read write one colour.
   A full mark sheet is never pulled down. Firm right answers are not pulled down
   to amber either — green follows the answer, and a missing explanation is the
   noReason flag. A read of red can still catch a pupil who got the sums right
   but explained the wrong idea, unless every point was actually shown.
   Where nothing has a checkable answer (history, a book), a green read can lift
   a pupil the point list missed because they used their own words.
   Every checkable answer wrong stays red whatever the read says. */
function settleLevel(graded, readLevelRaw, gets) {
  let level = graded.level;
  const read = ['green', 'amber', 'red'].includes(String(readLevelRaw || '').toLowerCase())
    ? String(readLevelRaw).toLowerCase() : null;
  const rank = { red: 0, amber: 1, green: 2 };
  const fullSheet = graded.qs > 0 && graded.full === graded.qs;
  const allWrong = graded.valueQs > 0 && graded.valueWrong === graded.valueQs;
  const allFirm = graded.valueQs > 0 && graded.valueFirm === graded.valueQs;
  const answeredAll = graded.answered === graded.qs && graded.qs > 0;
  if (read === 'green' && graded.valueQs === 0 && answeredAll) level = 'green';
  if (allFirm) level = 'green';
  /* "I think" / "not sure" on a sum is not a firm pass, even when every
     phrase on the card was ticked. */
  if (graded.valueHedged > 0 && level === 'green') level = 'amber';
  if (allWrong) level = 'red';
  if (read && !fullSheet && !allFirm && rank[read] < rank[level]) level = read;
  if (read === 'red' && !fullSheet && rank[read] < rank[level]) level = 'red';
  if (/^\s*nothing\b/i.test(String(gets || '').trim()) && level !== 'red') level = 'red';
  return level;
}

/* The whole-transcript read is a second opinion. Skip it when the count cannot
   move: every checkable answer wrong, or a full sheet of firm right answers.
   Keep it when a firm sheet is not full (the sums can be right and the idea wrong),
   when there is no checkable amount (history, a book), and when the count is mixed. */
function needsTranscriptRead(graded) {
  if (!graded) return true;
  const allWrong = graded.valueQs > 0 && graded.valueWrong === graded.valueQs;
  const allFirm = graded.valueQs > 0 && graded.valueFirm === graded.valueQs;
  const fullSheet = graded.qs > 0 && graded.full === graded.qs;
  if (allWrong) return false;
  if (allFirm && fullSheet) return false;
  return true;
}

function cardFromCount(graded) {
  const level = graded.level;
  if (level === 'green') return {
    level, gotRight: ['the answers'], gets: 'The answers are there.', shaky: '', faked: false,
    notes: 'The answers line up.', nextStep: 'Solid on the questions that were asked.'
  };
  if (level === 'red') return {
    level, gotRight: [], gets: 'Little of this yet.', shaky: 'The main idea.', faked: false,
    notes: 'The answers do not line up.', nextStep: 'The main idea is not there yet.'
  };
  return {
    level: 'amber', gotRight: ['part of it'], gets: 'Some of it, not all.', shaky: 'Not the whole idea.', faked: false,
    notes: 'Some answers line up and some do not.', nextStep: 'Part way there.'
  };
}

async function readTranscript(topic, transcript, model, maxTokens) {
  const raw = await llm([
    { role: 'system', content: verdictSystem(topic) },
    { role: 'user', content: 'Transcript:\n' + transcript }
  ], { json: true, temperature: 0, model, maxTokens });
  return parseJson(raw);
}

/* One pupil, one check. The same function the live site uses.
   Temperature stays 0 so the same answers do not drift between reads. */
async function gradeCheck(topic, transcript, questions, marks, year) {
  const qs = Array.isArray(questions) ? questions : [];
  const mk = Array.isArray(marks) ? marks : [];
  let graded = null;
  try {
    graded = mk.length ? await marksFromAnswers(topic, mk, transcript, qs, year) : null;
  } catch (e) { logError('/api/verdict grading', e.message); }
  let v = null;
  let readLevelRaw = null;
  try {
    if (!graded || needsTranscriptRead(graded)) {
      const lite = cfg.model;
      const flash = cfg.verdictModel || cfg.model;
      v = await readTranscript(topic, transcript, lite, 280);
      if (!v || !v.level) v = { level: 'amber', gets: '', shaky: '', faked: false, notes: 'Could not read a clear verdict.', nextStep: '' };
      if (graded && flash !== lite) {
        const moved = settleLevel(graded, v.level, v.gets);
        if (moved !== graded.level) {
          const second = await readTranscript(topic, transcript, flash, 400);
          if (second && second.level) v = second;
        }
      }
      readLevelRaw = v.level;
    } else {
      v = cardFromCount(graded);
    }
  } catch (e) {
    logError('/api/verdict grading', e.message);
    v = v && v.level ? v : { level: 'amber', gets: '', shaky: '', faked: false, notes: 'Could not read a clear verdict.', nextStep: '' };
  }
  if (!v || !v.level) v = { level: 'amber', gets: '', shaky: '', faked: false, notes: 'Could not read a clear verdict.', nextStep: '' };
  try {
    if (graded) {
      v.evidence = graded.evidence;
      v.marked = true;
      v.pointsHit = graded.hit;
      v.pointsTotal = graded.total;
      v.blanks = graded.blanks;
      v.qs = graded.qs;
      v.shown = graded.shown;
      v.reason = graded.reason;
      /* Green follows the answer. A right answer with no explanation stays green
         and is flagged, so the teacher can see who may fall apart next. */
      v.level = settleLevel(graded, readLevelRaw, v.gets);
      v.noReason = v.level === 'green' && !graded.reason;
      /* The model was asked for a description and it copied the summary into NEXT.
         The gaps are already on the card, so the line is built from the misses. */
      if (Array.isArray(graded.evidence) && graded.evidence.length) v.nextStep = nextStepFromGaps(graded.evidence);
      if (/^\s*nothing\b/i.test(String(v.gets || '').trim()) && v.level === 'red') {
        v.cappedBy = String(v.gets || '').trim().slice(0, 80);
      }
    } else if (!mk.length) {
      const perQ = await levelFromQuestions(topic, transcript);
      if (perQ) v.level = perQ;
    }
  } catch (e) { logError('/api/verdict grading', e.message); }
  return v;
}

function verdictSystem(topic) {
  return `Grade one short school check. Topic: "${topic}".
Judge the idea, not the spelling. A right answer in rough words is still right.
green = the main idea is right. amber = part of it is right, with a real gap. red = they did not answer, or the idea itself is wrong.
If the sums are right but the explanation is the wrong idea, the level is red.
A true fact that does not answer the question is not a point.
faked is true only when the wording is copied or machine-written, not when a child is simply wrong.
Return ONLY JSON:
{"gotRight":["short point"],"level":"amber","gets":"short phrase","shaky":"short phrase or empty","faked":false,"notes":"one short sentence","nextStep":"one concrete recap for the teacher, naming the missing idea"}
nextStep is an action for the teacher, based on what this pupil missed. Name the gap, for example "Recap why Britain joined (Germany invaded Poland in September 1939)". Do not describe the pupil, and do not repeat the notes. UK English. Do not use an em dash.`;
}

// ------------------------------------------------------------------- helpers
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.avif': 'image/avif',
  '.xml': 'application/xml' };

function withUsage(obj) {
  const usage = takeUsage();
  if (usage && usage.calls) {
    obj.usage = usage;
    console.log('AI usage ' + usage.calls + ' calls, in ' + usage.prompt + ', out ' + usage.completion + ', think ' + usage.reasoning);
  }
  return obj;
}
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
/* Same as readBody but leaves the bytes alone, for an uploaded recording. */
function readRaw(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > (limit || 8e6)) { req.destroy(); return resolve(null); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', () => resolve(null));
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
  if (rel === '/privacy' || rel === '/privacy/') rel = 'privacy.html';  // the privacy notice
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
const server = http.createServer((req, res) => runWithUsage(async () => {
  await readyPromise;
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (!p.startsWith('/api/')) return serveStatic(req, res, p);

    // ---- health
    if (p === '/api/health') return sendJson(res, { ok: true, hasKey: !!API_KEY, model: cfg.model, hasSpeech: !!ELEVEN_KEY });

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
    if (p === '/api/gate' && req.method === 'GET') {
      return sendJson(res, { inviteRequired: !!String(process.env.SIGNUP_CODE || '').trim() });
    }

    // ---- contact form on the marketing site. It is a different origin, so this
    // ---- one route carries CORS headers. Nothing else here does.
    if (p === '/api/contact' && req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': 'https://dotheygetit.app',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      return res.end();
    }

    if (p === '/api/contact' && req.method === 'POST') {
      res.setHeader('Access-Control-Allow-Origin', 'https://dotheygetit.app');
      if (tooMany(req, 'contact', 5, 3600000)) {
        return sendErr(res, 'Too many messages from here just now. Try again shortly.', 429);
      }
      const b = await readBody(req);
      const name = String(b.name || '').trim().slice(0, 120);
      const school = String(b.school || '').trim().slice(0, 160);
      const email = String(b.email || '').trim().slice(0, 200);
      const msg = String(b.message || '').trim().slice(0, 2000);
      if (!email || email.indexOf('@') < 1) return sendErr(res, 'That email address does not look right.');
      if (!msg) return sendErr(res, 'Add a message so I know what you need.');

      const tok = String(process.env.DISCORD_TOKEN || '').trim();
      const chan = String(process.env.FEEDBACK_CHANNEL || '').trim();
      if (tok && chan) {
        const body = { embeds: [{
          title: 'Enquiry from the website',
          description: msg,
          color: 0x8b5cff,
          fields: [
            { name: 'Name', value: name || 'not given', inline: true },
            { name: 'Email', value: email, inline: true },
            { name: 'School', value: school || 'not given', inline: true },
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

    if (p === '/api/feedback' && req.method === 'POST') {
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

    if (p === '/api/signup' && req.method === 'POST') {
      if (tooMany(req, 'signup', 8, 3600000)) return sendErr(res, 'Too many sign-ups from here just now. Try again shortly.', 429);
      const b = await readBody(req);
      const email = String(b.email || '').trim().toLowerCase();
      const pw = String(b.password || '');
      if (!email || !email.includes('@')) return sendErr(res, 'Please enter a valid email.');
      const needCode = String(process.env.SIGNUP_CODE || '').trim();
      if (needCode && String(b.invite || '').trim() !== needCode) {
        return sendErr(res, 'This app is invite-only while it is being tested. Ask for the code.');
      }
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
      if (tooMany(req, 'login', 20, 600000)) return sendErr(res, 'Too many attempts. Wait a minute and try again.', 429);
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
      if (tok) {
        const id = store.tokens[tok];
        delete store.tokens[tok];
        if (id && !Object.values(store.tokens).includes(id)) forgetTeacher(id);
      }
      saveStore();
      return sendJson(res, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' });
    }

    /* Teacher pages ping this while the dashboard is open, so a teacher who is
       reading the screen still counts as here. Pupil pages never call it. */
    if (p === '/api/here' && req.method === 'GET') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Not logged in.', 401);
      return sendJson(res, { ok: true }, { 'Cache-Control': 'no-store' });
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
        .map(c => ({ id: c.id, name: c.name, code: c.code, year: c.year || '', checks: store.sessions.filter(s => s.classId === c.id).length }));
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
      const c = { id: rid(6), teacherId: t.id, name, code, year: String(b.year || '').trim(), createdAt: Date.now() };
      store.classes.push(c);
      saveStore();
      return sendJson(res, { class: { id: c.id, name: c.name, code: c.code, year: c.year || '', checks: 0 } });
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
      /* If the pupil's name is given, say whether they have ALREADY finished this check, so a
         pupil cannot sit it twice - they get a done screen instead of the chat. */
      const who = String(url.searchParams.get('name') || '').trim().toLowerCase();
      const done = !!who && s.students.some(st => String(st.name).trim().toLowerCase() === who);
      noteCheck(s.id);
      return sendJson(res, { className: c.name, check: { id: s.id, topic: s.topic, questions: s.questions || [] }, names, done });
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
      const marks = Array.isArray(b.marks) ? b.marks.map(a => Array.isArray(a)
        ? a.map(m => String(m || '').trim()).filter(Boolean).slice(0, 3) : []) : [];
      const s = { id: rid(4), classId: c.id, teacherId: t.id, topic, questions, marks, students: [], createdAt: Date.now() };
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
      noteCheck(s.id);
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
      const year = String(b.year || '').trim();
      /* The mark points make this a nested JSON shape, and the model mangles it now and
         then. One retry costs a fraction of a second and saves the teacher an error
         message - and silently losing the marks would fall back to guessing. */
      let obj = null;
      /* if the teacher has already written or edited the questions, mark those */
      const asked = Array.isArray(b.questions) ? b.questions.map(q => String(q || '').trim()).filter(Boolean) : [];
      for (let attempt = 0; attempt < 2 && !obj; attempt++) {
        const sys = asked.length ? markWriterSystem(topic, asked) : questionWriterSystem(topic, count, year);
        const raw = await llm([{ role: 'system', content: sys }],
          { json: true, temperature: attempt ? 0.4 : 0.7, maxTokens: 900 });
        const o = parseJson(raw);
        if (asked.length) {
          if (o && Array.isArray(o.marks) && o.marks.length) obj = { questions: asked, marks: o.marks };
        } else if (o && Array.isArray(o.questions) && o.questions.length) obj = o;
        if (!obj) logError('/api/generate', 'unreadable JSON, retrying');
      }
      let qs = obj && Array.isArray(obj.questions) ? obj.questions : [];
      qs = qs.map(q => String(q || '').trim()).filter(Boolean).slice(0, count);
      if (!qs.length) return sendErr(res, 'Could not generate questions. Try a clearer topic.');
      /* marks[i] are the mark points for questions[i]. The teacher can edit them, and
         from then on every pupil is marked against the teacher's standard - not the
         model's opinion of the day. */
      const rawMarks = obj && Array.isArray(obj.marks) ? obj.marks : [];
      let marks = qs.map((q, i) => splitPoints(Array.isArray(rawMarks[i]) ? rawMarks[i] : []));
      /* A question with ONE mark point cannot produce an amber: the pupil either hit it
         or they did not, so the class comes back all green and all red with nothing in
         between. That is not a stricter marking, it is a broken one - and it is exactly
         what a class of 30 did on a run where the writer ignored "2 or 3 points".
         One more ask, against the questions we already have, and keep the better of the
         two attempts. Cheap, and it only fires when the first draft was thin. */
      const dead = a => qs.filter((q, i) => !answerable(q, a[i] || [])).length;
      const score = a => a.filter(m => m.length >= 2).length;
      /* Ask again, against the questions we already have, and keep the better draft. It
         fires when a question came back with fewer than 2 points (a single point cannot
         produce an amber), and when a question that asks for an answer has no point that
         IS the answer. Two attempts at most. */
      for (let attempt = 0; attempt < 2 && (marks.filter((m, i) => m.length < minPointsFor(qs[i])).length || dead(marks)); attempt++) {
        try {
          const retry = await llm([{ role: 'system', content: markWriterSystem(topic, qs) }],
            { json: true, temperature: 0.4, maxTokens: 900 });
          const o2 = parseJson(retry);
          if (o2 && Array.isArray(o2.marks)) {
            const alt = qs.map((q, i) => splitPoints(Array.isArray(o2.marks[i]) ? o2.marks[i] : []));
            const better = dead(alt) < dead(marks) || (dead(alt) === dead(marks) && score(alt) > score(marks));
            if (better) marks = alt;
          }
        } catch (e) { logError('/api/generate marks retry', e.message); }
      }
      /* A question left with ONE point is the whole bug in miniature: a bare correct answer
         hits it, so the question hands out a free point and the pooled band reads green for
         a pupil who never explained anything. Every question is topped up to two points -
         the answer, and the working - in a single call, and only for the questions that
         came back thin. Doing it here rather than re-rolling the lot keeps the points a
         teacher has already read. */
      const thin = qs.map((q, i) => ({ q, i, have: marks[i] || [] })).filter(x => x.have.length < 2 && !shortFact(x.q) && !asksOneFact(x.q));
      if (thin.length) {
        try {
          const list = thin.map((x, n) => (n + 1) + '. ' + x.q + '\n   already marked: ' + (x.have[0] || '(nothing yet)')).join('\n');
          const raw = await llm([
            { role: 'system', content: `You are finishing off the mark points for a short school quiz on "${topic}".
Each question below already has one point and needs a second, different one: the working on a sum, or a separate reason on a why or how. Do not repeat the point that is already there in different words. Do not add a fact the question never asked. If there is no second thing the question actually asks for, return an empty string for that question. Keep it short, in plain words, and make sure a pupil who answers that question correctly could actually say it.
` + list + `
Return ONLY JSON: {"points":["...","..."]} - one point per question, in order.` }
          ], { json: true, temperature: 0.4, maxTokens: 400 });
          const o3 = parseJson(raw);
          const extra = o3 && Array.isArray(o3.points) ? o3.points : [];
          thin.forEach((x, n) => {
            const p = splitPoints([extra[n] == null ? '' : extra[n]]).filter(Boolean);
            if (p.length) marks[x.i] = marks[x.i].concat(p.slice(0, 1));
          });
        } catch (e) { logError('/api/generate marks top-up', e.message); }
      }
      /* Critic: a second, independent pass over the mark points, because the writer
         will happily produce a point that is simply FALSE for the question it sits on.
         On a 30-pupil run it wrote "the bottom number (denominator) is the same" for
         "which is bigger, 1/2 or 1/4?" - they are 2 and 4 - so a pupil who answered
         correctly, "a half is bigger than a quarter", hit nothing and came back red.
         The critic re-derives the scheme for any question that is wrong or thin, and a
         corrected scheme is only taken when it still has two points, so a bad critic
         can never leave a question unmarked. */
      try {
        const audit = qs.map((q, i) => (i + 1) + '. Question: ' + q + '\n   current points: ' +
          (marks[i] || []).map((p, n) => (n + 1) + ') ' + p).join('  |  ')).join('\n');
        const raw = await llm([
          { role: 'system', content: criticSystem(topic, audit) }
        ], { json: true, temperature: 0, maxTokens: 900, model: cfg.criticModel || cfg.verdictModel || cfg.model });
        const o = parseJson(raw);
        if (o && Array.isArray(o.marks)) {
          qs.forEach((q, i) => {
            const fixed = takeCriticMarks(q, o.marks[i]);
            if (fixed) marks[i] = fixed;
          });
        }
      } catch (e) { logError('/api/generate critic', e.message); }
      marks = qs.map((q, i) => fitMarks(q, marks[i]));
      return sendJson(res, { questions: qs, marks });
    }

    // ---- student chat
    // ---- speech to text
    /* A pupil who would rather say it than type it. The clip is handed to ElevenLabs and
       only the words come back; we keep no audio. The transcript goes into the answer box
       for the pupil to check, so what reaches the teacher is still their own words. */
    if (p === '/api/stt' && req.method === 'POST') {
      if (!ELEVEN_KEY) return sendErr(res, 'Speaking is not switched on for this server. Type your answer instead.', 503);
      const audio = await readRaw(req, 6e6);
      if (!audio || audio.length < 1200) return sendErr(res, 'That was too short to hear. Hold it a moment longer and try again.');
      const type = String(req.headers['content-type'] || '').split(';')[0].trim() || 'audio/webm';
      try {
        const fd = new FormData();
        fd.append('file', new Blob([audio], { type }), type.includes('mp4') ? 'answer.mp4' : 'answer.webm');
        fd.append('model_id', 'scribe_v1');
        const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST', headers: { 'xi-api-key': ELEVEN_KEY }, body: fd
        });
        const raw = await r.text();
        if (!r.ok) {
          logError('/api/stt', r.status + ' ' + raw.slice(0, 200));
          return sendErr(res, 'Could not hear that one. Try again, or type it.');
        }
        const j = parseJson(raw) || {};
        const text = String(j.text || '').replace(/\s+/g, ' ').trim();
        if (!text) return sendErr(res, 'Nothing was picked up. Try again, or type it.');
        return sendJson(res, { text });
      } catch (e) {
        logError('/api/stt', e.message || String(e));
        return sendErr(res, 'Could not hear that one. Try again, or type it.');
      }
    }

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
      noteCheckFromCode(codeIn);

      const total = questions.length || cfg.maxQuestions;
      const asked = history.filter(x => x.role === 'assistant').length;

      if (covered >= total) return sendJson(res, { reply: CLOSING, done: true, covered, digs });

      // Legacy: no seeded questions - let the AI ask each one.
      if (!questions.length) {
        const raw = await llm([{ role: 'system', content: askSystem(topic) }, ...history], { json: true, temperature: 0.6, maxTokens: 80 });
        const obj = parseJson(raw);
        let q = ((obj && obj.question) || raw || '').replace(/\[done\]/gi, '').trim() || 'Tell me what you know about this.';
        if (asked === 0) q = GREET + q;
        return sendJson(res, withUsage({ reply: q, done: false, covered: covered + 1, digs }));
      }

      // First turn: greet and ask the teacher's first question, word for word.
      if (asked === 0) {
        return sendJson(res, {
          reply: GREET + questions[0],
          done: false, covered: 1, digs: 0
        });
      }

      const nextQ = questions[covered];
      const allowDig = digs < 1;
      const raw = await llm([
        { role: 'system', content: followupSystem(topic, nextQ, allowDig) },
        ...history
      ], { json: true, temperature: 0.4, maxTokens: 80 });
      const obj = parseJson(raw);

      if (obj && obj.followup && typeof obj.question === 'string' && obj.question.trim() && allowDig) {
        return sendJson(res, withUsage({ reply: obj.question.trim().replace(/\[done\]/gi, ''), done: false, covered, digs: digs + 1 }));
      }
      return sendJson(res, withUsage({ reply: nextQ, done: false, covered: covered + 1, digs }));
    }

    // ---- verdict
    if (p === '/api/verdict' && req.method === 'POST') {
      const b = await readBody(req);
      const topic = String(b.topic || '').trim();
      const transcript = String(b.transcript || '').trim();
      if (!topic || !transcript) return sendErr(res, 'Missing topic or transcript.');
      if (b.code) noteCheckFromCode(b.code);
      let year = String(b.year || '').trim();

      /* the teacher's mark points for this check - sent direct, or looked up from
         the class code the pupil came in on. The questions come too, because a mark
         point on its own does not tell the teacher which question it belonged to. */
      let marks = Array.isArray(b.marks) ? b.marks : [];
      let questions = Array.isArray(b.questions) ? b.questions.map(q => String(q || '').trim()).filter(Boolean) : [];
      if ((!marks.length || !questions.length) && b.code) {
        const cls = store.classes.find(x => x.code === String(b.code).trim().toLowerCase());
        const past = cls ? store.sessions.filter(s => s.classId === cls.id) : [];
        const sess = past.sort((x, y) => y.createdAt - x.createdAt)[0];
        if (sess) {
          if (!marks.length && Array.isArray(sess.marks)) marks = sess.marks;
          if (!questions.length && Array.isArray(sess.questions)) questions = sess.questions;
          if (cls && cls.year) year = String(cls.year);
        }
      }
      const v = await gradeCheck(topic, transcript, questions, marks, year);
      const usage = takeUsage() || { calls: 0, prompt: 0, completion: 0, reasoning: 0, byModel: {} };
      if (usage.calls) console.log('AI usage ' + usage.calls + ' calls, in ' + usage.prompt + ', out ' + usage.completion + ', think ' + usage.reasoning);
      return sendJson(res, { verdict: v, usage });
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

    if (p === '/api/admin/live' && req.method === 'GET') {
      const me = currentTeacher(req);
      if (!me) return sendErr(res, 'Not signed in.', 401);
      if (me.role !== 'admin') return sendErr(res, 'Not allowed.', 403);
      return sendJson(res, liveSnapshot(), { 'Cache-Control': 'no-store' });
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

    // ---- owner: remove a teacher, and everything they made
    /* Only the owner can do this, and only for a teacher. Two accounts are never
       removable here: your own (you would lock yourself out of the owner view) and
       another owner account (that is a change to the code, not to the data). The
       teacher's classes go, every check inside them goes, and every token they were
       signed in with is dropped, so their browser is signed out on the next click. */
    if (p === '/api/admin/teacher/delete' && req.method === 'POST') {
      const me = currentTeacher(req);
      if (!me) return sendErr(res, 'Not signed in.', 401);
      if (me.role !== 'admin') return sendErr(res, 'Not allowed.', 403);
      const b = await readBody(req);
      const t = store.teachers.find(x => x.id === String(b.teacherId || '').trim());
      if (!t) return sendErr(res, 'That teacher is already gone.');
      if (t.id === me.id) return sendErr(res, 'That is your own account. You cannot remove yourself.');
      if ((t.role || 'teacher') === 'admin') return sendErr(res, 'That is an owner account. Change it in the code, not here.');
      const ids = store.classes.filter(c => c.teacherId === t.id).map(c => c.id);
      const theirs = store.sessions.filter(s => ids.includes(s.classId) || s.teacherId === t.id);
      const gone = {
        email: t.email,
        deletedClasses: ids.length,
        deletedChecks: theirs.length,
        deletedAnswers: theirs.reduce((n, s) => n + (s.students || []).length, 0)
      };
      store.teachers = store.teachers.filter(x => x.id !== t.id);
      store.classes = store.classes.filter(c => c.teacherId !== t.id);
      store.sessions = store.sessions.filter(s => !ids.includes(s.classId) && s.teacherId !== t.id);
      for (const [tok, owner] of Object.entries(store.tokens)) if (owner === t.id) delete store.tokens[tok];
      forgetTeacher(t.id);
      theirs.forEach(s => forgetCheck(s.id));
      saveStore();
      return sendJson(res, Object.assign({ ok: true }, gone));
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
        c = { id: rid(6), code, key: rid(14), name: String(b.name || '').trim(), year: String(b.year || '').trim(), anon: true, createdAt: Date.now() };
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
      /* A class made from a teacher account has no key of its own - the login IS the
         key. Demanding one anyway meant this endpoint refused the very teacher who
         owned the class, so anything reading results by code came back empty. A class
         made without an account still needs its key, and still gets checked. */
      if (c.key) {
        if (c.key !== key) return sendErr(res, 'Not your check.');
      } else {
        const t = currentTeacher(req);
        if (!t || c.teacherId !== t.id) return sendErr(res, 'Not your check.', 401);
      }
      const s = latestSessionForClass(c.id);
      if (!s) return sendErr(res, 'The server has forgotten this check (free hosting clears itself).');
      return sendJson(res, { topic: s.topic, questions: s.questions, createdAt: s.createdAt, students: s.students || [] });
    }

    // ---- save a student result (student submits with class code)
    if (p === '/api/result' && req.method === 'POST') {
      if (tooMany(req, 'result', 60, 60000)) return sendErr(res, 'Slow down a moment, then try again.', 429);
      const b = await readBody(req);
      const code = String(b.code || '').trim().toLowerCase();
      const name = String(b.name || '').trim() || 'Student';
      const c = store.classes.find(x => x.code === code);
      if (!c) return sendErr(res, 'No class found with that code.');
      const s = latestSessionForClass(c.id);
      if (!s) return sendErr(res, 'No check is ready for this class yet.');
      noteCheck(s.id);
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
      const going = store.sessions.filter(s => s.classId === c.id);
      const gone = going.length;
      going.forEach(s => forgetCheck(s.id));
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
      forgetCheck(s.id);
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
    /* The teacher has the final say. Whatever the marking said, the teacher can set the
       level themselves. The disagreement is kept rather than overwritten, because a
       teacher's own judgement is the only real label we have - every override is a
       worked example of where the marking was wrong. */
    if (p === '/api/override' && req.method === 'POST') {
      const t = currentTeacher(req);
      if (!t) return sendErr(res, 'Please log in.', 401);
      const b = await readBody(req);
      const s = store.sessions.find(x => x.id === b.sessionId && x.teacherId === t.id);
      if (!s) return sendErr(res, 'Check not found.');
      const stu = (s.students || []).find(x => x.name === b.name);
      if (!stu) return sendErr(res, 'Pupil not found.');
      const lv = String(b.level || '').trim().toLowerCase();
      if (lv && !['green', 'amber', 'red'].includes(lv)) return sendErr(res, 'Bad level.');
      const ai = stu.aiLevel || (stu.verdict && stu.verdict.level) || null;
      if (lv && lv === ai) { stu.teacherLevel = null; }        /* agreeing is not a correction */
      else { stu.teacherLevel = lv || null; stu.aiLevel = ai; if (lv) stu.overriddenAt = Date.now(); }
      saveStore();
      return sendJson(res, { ok: true, level: stu.teacherLevel, aiLevel: stu.aiLevel });
    }

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
        .concat(['Checks done', 'Latest level', 'No reason given', 'Shaky on', 'Next step']);
      const rows = names.map(n => {
        const cells = checks.map(s => { const st = find(s, n); return st ? ((st.verdict && st.verdict.level) || 'amber') : ''; });
        const verdicts = checks.map(s => find(s, n)).filter(st => st && st.verdict).map(st => st.verdict);
        const last = verdicts[verdicts.length - 1] || {};
        return [n].concat(cells).concat([verdicts.length, last.level || '', last.noReason ? 'yes' : '', last.shaky || '', last.nextStep || '']);
      });
      const note = ['NOTE: AI guidance only - not a formal assessment or grade. A teacher must review this before it informs any decision.', '', '', '', ''];
      const csv = '\uFEFF' + [head].concat(rows).concat([note]).map(r => r.map(quote).join(',')).join('\r\n') + '\r\n';
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
}));

if (require.main === module) {
  server.listen(cfg.port, () => {
    console.log('');
    console.log('  Get It? is running');
    console.log('  ->  http://localhost:' + cfg.port);
    console.log('  Key loaded: ' + (API_KEY ? 'yes' : 'NO - add key.txt and restart'));
    console.log('  AI: ' + (process.env.MOCK_AI === '1' ? 'MOCK — marks are fake. Never set MOCK_AI on the live site.' : describeProvider()));
    console.log('');
    console.log('  Keep this window open. Close it to stop.');
    console.log('');
  });
}

module.exports = { gradeCheck, setMarker, questionWriterSystem, criticSystem, takeCriticMarks, asksOneFact };