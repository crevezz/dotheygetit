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
- ONE job. If it needs two steps, two sums, or two things worked out, that is two
  questions - so drop one. A quick check asks one thing at a time.
- Numbers as digits, not words: "5 + 7", not "five and seven". Never spell a number out
  unless it is part of a phrase like "two quarters".
- No scene-setting. No "Imagine you have...", "Suppose that...", "Consider a...". Give
  the facts flat and let them get on with it.
- Plain words for the idea, and no long words to sound clever. Use the term the class
  used, once, with a plain gloss beside it: "the bottom number (the denominator)".
- An "explain" question is fine, but it must name the thing to explain in everyday words
  and still be short.

Read it back once, at normal speed. Could a ten-year-old answer it straight off without
asking what you mean? If not, write it again, shorter.

WRONG -> RIGHT
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
"Why do you only add the top numbers?"`;

/* One idea per mark point. The model kept bundling several ideas into a single point
   ("uses sunlight, water and carbon dioxide to make glucose"), and it even emitted two
   points as one comma-joined string. A bundled point cannot be half-hit, so a pupil who
   half understood scored the same as one who did not - which is what put the middle band
   all over the place. */
const MARK_RULES = `Write 2 or 3 mark points for each question - 2 for a question with one main idea,
3 only for a richer question. Never pad a question out to three: if two points say the
same thing in different words, that is one point, and the pupil's mark is meaningless.

FIRST, and above everything else: a point must be something the pupil could actually SAY
in their answer to that question. If the question asks for an answer - "What is 5 + 7?" -
one point has to BE that answer. A statement about the method ("addition is combining two
amounts together") is NOT a point for that question, because a pupil who answers it
correctly never says it. A point a short, correct answer cannot reach is dead weight: it
marks every pupil down for something the question never asked. A short answer question
still gets TWO points - the answer itself, and the working.
For short answer questions the points ARE the answers:
Q: "What is 5 + 7?"  Good: ["says 12", "adds the two numbers together"]
Bad: ["explains that five and seven were added together"] - the pupil never says that.
Q: "You eat 2 of 10 apples. How many are left?"  Good: ["says 8", "takes 2 away from 10"]
WORK THE ANSWER OUT YOURSELF FIRST, then write the point that gives THAT answer. A point
carrying the wrong answer is worse than no point at all: it marks the pupils who are right
down for being right, and hands credit to the ones who are wrong.
Q: "A pizza of eight slices has three eaten. What fraction is left?"
Good: ["says five eighths", "works out eight take away three"]   Bad: ["says three eighths"]
A question that just asks for the result of a sum - "What is 15 + 8?", "30 - 12" - has ONE
point: the answer, in the words a pupil would say ("the answer is 23"). Do NOT add "adds the
two numbers together" or "subtracts 12 from 30" as a second point. There is no method the
pupil can show on a sum - the number IS the answer - and the extra point can only mark them
down for answering a sum correctly, which is the one thing a teacher will not forgive.
For a question that asks WHY - "explain why two quarters is the same as a half" - there is
no number to give, so its points are the reasons. One of them must be the claim itself, in
the words a pupil would likely use, so that a muddled but real attempt can reach it. A pupil
who gets there in clumsy words has shown the idea; never write a point that needs tidy
wording to be reachable.
On a WHY question the points are separate REASONS. Two reasons that are the same idea in
different words - "the pieces are the same size" and "you are combining same-sized pieces" -
are ONE point; writing both doubles the marks against a pupil who gave that one reason. If
you can say "in other words..." and your second point is what follows, delete it.
WRITE EVERY POINT IN THE WORDS THE PUPIL WOULD SAY OUT LOUD, not the words from the
textbook. This is the difference between marking the idea and marking the vocabulary. A
point written in schoolbook language is reachable ONLY by the pupil who has memorised the
phrase - the child who understands it but says it their own way scores nothing, which is
backwards and is the one thing a teacher will not forgive. Written plainly, both reach it.
Good: "makes the bottoms the same so they can be compared", "the answer is 4/5".
Bad: "finds the lowest common denominator of three and four" - it names the method of ONE
pupil. Where a question can be answered by more than one valid method - a common
denominator, cross-multiplying, decimals, a drawing, comparing each to a whole - the
working point must be reachable by ANY of them, so a pupil who shows the same idea another
way still reaches it.
That means a question with several valid methods has ONE working point, not one per
method. NEVER write "makes the bottoms the same" and "finds a common denominator" and
"turns them into decimals" as three points: a pupil who uses one of them has shown the
working, and the other points mark them down for taking a different route. Write the ONE
point so any route reaches it - "works out a way to compare them and says which is bigger"
- and let the answer point carry the rest. Never repeat the same idea as two points: if two
points would both be ticked by the same answer, they are ONE point, not two.
If in doubt, ask: could a ten-year-old who gets this but hates writing reach this line?
NEVER WRITE THE ANSWER TWICE. "The sum of 15 and 23 is 38" and "Correctly adds 15 and 23"
are the same fact in two sentences - that is ONE point, not two, and it wastes half the
question. The second point is always the WORKING: how they got there. For "What is
105 + 7?" the two points are "says 112" and "adds the two numbers together". A pupil who
just types "112" has shown the first and not the second, and that is the honest mark.
Each point is ONE idea in ONE short sentence, twelve words or so. Never put two ideas in
one point and never write a list inside one. If you catch yourself writing a comma followed
by "and", that is two points - split them.
They must be about the subject, and never about how it is written.
Good: "says the bottoms have to match first", "explains that more pieces means each piece is
smaller", "says a fifth is bigger than a tenth".
Bad: "uses sunlight, water and carbon dioxide to make glucose" (three ideas in one),
"correctly states the denominator remains seven" beside "writes the answer as 5/7"
(the same fact twice), "clear answer", "good use of vocabulary".`;

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
  return /\d\s*(?:[-+\/]|plus|minus|times|add|subtract|take away)\s*\d/.test(t);
}

function splitPoints(list) {
  const out = [];
  for (const raw of list) {
    let s = String(raw == null ? '' : raw).trim();
    if (!s) continue;
    if (s === '[object Object]') continue;
    s = s.replace(/^(the\s+)?pupil\s+/i, '').replace(/^\-\s*/, '');
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
    const parts = s.split(/[.;]\s+|\s+[-\u2013]\s+/).map(x => x.trim().replace(/^(so|then|therefore|and)\s+/i, '').replace(/[,.]$/, '').trim());
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

function questionWriterSystem(topic, count) {
  return `You are helping a teacher write a quick understanding check.

Topic: "${topic}".

Write ${count} short, open questions that find out whether a student really understands this topic.

${PLAIN_WORDS}

${NO_IMAGES}

Rules:
- One question each. Short and clear. Do not write answers.
- Start easy, get harder.
- At least one should ask them to explain or apply it in their own words.
- No yes/no questions.
- If the topic is naturally visual, ask about it in words: not "what can you see in this
  diagram of the water cycle?" but "what happens to rain after it lands?".

Return ONLY JSON, exactly this shape:
{"questions":["...","..."],"marks":[["...","..."],["...","..."]]}

"marks" is a parallel list: marks[0] holds the mark points for questions[0], and so on.
${MARK_RULES}`;
}

/* The teacher has written or edited the questions. These are the mark points for THEM.
   Without this the marks were drafted against whatever questions the AI would have
   written itself, so a class was being marked against the wrong question. */
function markWriterSystem(topic, questions) {
  const list = questions.map((q, i) => (i + 1) + '. ' + q).join('\n');
  return `Topic: "${topic}".

A teacher wrote these questions to find out whether a pupil really understands it:
${list}

${MARK_RULES}

${NO_IMAGES}

Return ONLY JSON, one list per question, in the same order as the questions:
{"marks":[["...","..."],["...","..."]]}`;
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

${PLAIN_WORDS}

${NO_IMAGES}

Return ONLY JSON, no other text: {"followup":false,"question":""}
- Set "followup" to true and put your single follow-up question in "question" ONLY when you are asking a follow-up.${allowDig ? '' : '\n- You have already used your one follow-up, so "followup" MUST be false.'}`;
}

function askSystem(topic) {
  return `You are "Check", a friendly examiner. Topic: "${topic}".
Ask ONE short, open question to find out what the student understands.

${PLAIN_WORDS}

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
function fracs(s) {
  const t = String(s || '').toLowerCase().replace(/\s*\/\s*/g, '/');
  const out = [];
  (t.match(/\d+\s*\/\s*\d+/g) || []).forEach(f => out.push(f.replace(/\s/g, '')));
  (t.match(/[a-z]+/g) || []).forEach(w => { if (WORD_FRAC[w]) out.push(WORD_FRAC[w]); });
  return out;
}

/* "4/5 is bigger than 3/4" means 4/5 is the answer. The first fraction in the phrase is
   the one being called the bigger (or smaller) one; anything after "than" is what it is
   being compared against. */
function claim(text) {
  const m = String(text || '').match(/([^,;.:!?]{0,24}?)\s+(?:is|are)\s+(?:the\s+)?(bigger|larger|greater|more|smaller|less|biggest|largest|smallest)\b/i);
  if (!m) return null;
  const f = fracs(m[1]);
  if (!f.length) return null;
  return { win: f[0], dir: /^(?:smaller|less|smallest)$/i.test(m[2]) ? 'less' : 'more' };
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
    const f = fracs(m[1]);
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

async function marksFromAnswers(topic, marks, transcript, questions) {
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
  const paired = answers.length === marks.length;
  const sysFor = (lo, hi) => `Topic: "${topic}".

A pupil had to show these things to count as understanding it:
${points.map((p, i) => ({ n: i + 1, p })).filter(x => x.n - 1 >= lo && x.n - 1 < hi).map(x => x.n + '. ' + x.p).join('\n')}

You get ONE answer the pupil gave. Say which of those numbered points that answer actually
shows. Be strict about the meaning and generous about the wording: clumsy, badly spelled
English that shows the idea DOES count. Words that sound right but show nothing DO NOT.
A correct answer on its own shows the point that names that answer: a pupil who writes
"12" to "what is 5 + 7?" has shown the point "says 12".
A correct answer ALSO shows the working or method point that produced it, even though the
pupil never said the words: "3/4" to "what is 1/4 + 2/4?" shows "adds the top numbers" and
"keeps the bottom number the same", because getting 3/4 IS adding the tops and keeping the
bottom. "3/5" to "2/5 + 1/5" shows the same two points. A right answer is evidence of the
method, so tick the method point. Only refuse a working point when the answer is wrong or
has nothing to do with it. This does NOT apply to a WHY point - a number cannot show a
reason, so a reason the pupil never gave stays a miss. More examples: "17" to "what is 9 + 8?" shows both "the answer is 17" and "adds 9 and 8".
A muddled attempt at the idea counts. Judge what the pupil meant, not how they said it - a
garbled sentence that reaches for the right idea has shown it, and a tidy sentence that
merely restates the question has not. A pupil may show a point by a different valid method
than the one it names - decimals, a drawing, cross-multiplying. If the idea is there by any
sound route, tick it.

A pupil is allowed to show the same point more than once, so only judge this one answer.

${NO_IMAGES}

Return ONLY JSON: {"shown":[1,3]}`;
  /* Which answer showed each point, not merely whether it was shown somewhere. Keeping
     the answer is what lets the card print the child's own words under the point they
     earned - so the teacher can agree or disagree from the evidence instead of from the
     colour. The words are quoted, never summarised. */
  const hit = new Map();
  for (let k = 0; paired && k < answers.length; k++) {
    const a = answers[k];
    const lo = paired ? offset[k] : 0;
    const hi = paired ? offset[k] + (marks[k] || []).filter(Boolean).length : points.length;
    if (paired && !(hi > lo)) continue;
    /* nothing of their own to mark */
    if (isEcho(a, paired ? questions[k] : questions.join(' '))) continue;
    try {
      const raw = await llm([
        { role: 'system', content: sysFor(lo, hi) },
        { role: 'user', content: 'The pupil answered: ' + a }
      ], { json: true, temperature: 0, model: cfg.verdictModel || cfg.model });
      const o = parseJson(raw);
      if (o && Array.isArray(o.shown)) o.shown.forEach(n => {
        const i = Number(n) - 1;
        if (i >= 0 && i < points.length && !hit.has(i)) hit.set(i, a);
      });
    } catch (e) { logError('/api/verdict marks', e.message); }
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
  const bare = answers.filter(a => /^[\s\d\/.,+-]+$/.test(a));
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
    const lo = offset[qi];
    const asked = nums((questions && questions[qi]) || '');
    for (let k = 0; k < ps.length; k++) {
      if (hit.has(lo + k)) continue;
      const spare = nums(ps[k]).filter(n => !asked.includes(n));
      if (!spare.length) continue;
      const m = bare.find(a => spare.some(n => nums(a).includes(n)));
      if (m) hit.set(lo + k, m);
    }
  }
  /* The working point beside a sum's answer. If a question's answer point was shown by a
     bare number, the operation was done, so the working point on that SAME question is
     shown too - the same child's number, on their own question. A why-question's answer is
     never bare, so nothing is added there. */
  const OP_WORD = /\b(add|adds|added|subtract\w*|take\w*\s+away|plus|minus|multipl\w*|divid\w*|count\w*|remove\w*|leaves|combine\w*|total)\b/i;
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
    const lo = offset[qi];
    let quote = null;
    for (let k = 0; k < ps.length; k++) {
      const h = hit.get(lo + k);
      if (h != null && /^[\s\d\/.,+-]+$/.test(h)) { quote = h; break; }
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
  /* The BAND comes from the QUESTIONS the pupil showed something on, not from the pooled
     points. Both earlier rules failed the same way: per-question voting let a one-point
     question read green, and the pooled share parked a pupil on 36% - a number no teacher
     can call amber or red. Points are still counted, and still shown, as detail. */
  const evidence = [];
  let base = 0, hitPool = 0, allPool = 0, blanks = 0;
  for (let qi = 0; qi < marks.length; qi++) {
    const ps = (marks[qi] || []).filter(Boolean);
    if (!ps.length) continue;
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
  /* The colour is decided by QUESTIONS, not by points. A percentage always has a grey
     zone - 36% is not obviously amber and not obviously red - and a teacher should never
     have to argue with a number. Questions are whole numbers, so they have a cliff:
       nothing on any question          -> red
       something on every question, and
       one of them answered AND explained -> green
       anything in between               -> amber
     A blank question therefore caps the pupil at amber on its own: they cannot have shown
     something on every question if one of them was empty. The points still counted, and
     are still shown, but only as detail underneath - they do not move the colour. */
  const qCount = evidence.length;
  const shownQs = evidence.filter(e => e.got > 0).length;
  const fullQs = evidence.filter(e => e.got >= e.total).length;
  const level = !shownQs ? 'red'
    : (shownQs === qCount && fullQs > 0) ? 'green'
    : 'amber';
  return { level, hit: hitPool, total: allPool, blanks, shown: shownQs, qs: qCount, evidence };
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
      /* If the pupil's name is given, say whether they have ALREADY finished this check, so a
         pupil cannot sit it twice - they get a done screen instead of the chat. */
      const who = String(url.searchParams.get('name') || '').trim().toLowerCase();
      const done = !!who && s.students.some(st => String(st.name).trim().toLowerCase() === who);
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
      /* The mark points make this a nested JSON shape, and the model mangles it now and
         then. One retry costs a fraction of a second and saves the teacher an error
         message - and silently losing the marks would fall back to guessing. */
      let obj = null;
      /* if the teacher has already written or edited the questions, mark those */
      const asked = Array.isArray(b.questions) ? b.questions.map(q => String(q || '').trim()).filter(Boolean) : [];
      for (let attempt = 0; attempt < 2 && !obj; attempt++) {
        const sys = asked.length ? markWriterSystem(topic, asked) : questionWriterSystem(topic, count);
        const raw = await llm([{ role: 'system', content: sys }],
          { json: true, temperature: attempt ? 0.4 : 0.7 });
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
      for (let attempt = 0; attempt < 2 && (marks.filter((m, i) => m.length < (qs[i] && plainSum(qs[i]) ? 1 : 2)).length || dead(marks)); attempt++) {
        try {
          const retry = await llm([{ role: 'system', content: markWriterSystem(topic, qs) }],
            { json: true, temperature: 0.4 });
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
      const thin = qs.map((q, i) => ({ q, i, have: marks[i] || [] })).filter(x => x.have.length < 2);
      if (thin.length) {
        try {
          const list = thin.map((x, n) => (n + 1) + '. ' + x.q + '\n   already marked: ' + (x.have[0] || '(nothing yet)')).join('\n');
          const raw = await llm([
            { role: 'system', content: `You are finishing off the mark points for a short school quiz on "${topic}".
Each question below already has one point. Every question needs TWO: the ANSWER itself, and the WORKING (what the pupil did to get it). Write the ONE missing point for each question - whichever of the two is not already there. Keep it short, in plain words, and make sure a pupil who answers that question correctly could actually say it.
` + list + `
Return ONLY JSON: {"points":["...","..."]} - one point per question, in order.` }
          ], { json: true, temperature: 0.4 });
          const o3 = parseJson(raw);
          const extra = o3 && Array.isArray(o3.points) ? o3.points : [];
          thin.forEach((x, n) => {
            const p = splitPoints([extra[n] == null ? '' : extra[n]]).filter(Boolean);
            if (p.length) marks[x.i] = marks[x.i].concat(p.slice(0, 1));
          });
        } catch (e) { logError('/api/generate marks top-up', e.message); }
      }
      return sendJson(res, { questions: qs, marks });
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
        if (asked === 0) q = GREET + q;
        return sendJson(res, { reply: q, done: false, covered: covered + 1, digs });
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
        }
      }
      const raw = await llm([
        { role: 'system', content: verdictSystem(topic) },
        { role: 'user', content: 'Transcript:\n' + transcript }
        /* temperature 0: the same answers must always get the same level. A
           teacher who re-reads a pupil cannot see the grade move. */
      ], { json: true, temperature: 0, model: cfg.verdictModel || cfg.model });
      let v = parseJson(raw);
      if (!v || !v.level) v = { level: 'amber', gets: '', shaky: '', faked: false, notes: 'Could not read a clear verdict.', nextStep: '' };
      const readLevelRaw = v.level;

      /* the level comes from grading each question separately, and so does the evidence
         behind it; everything else (gets / shaky / next step) still comes from the read
         above. The evidence rides inside the verdict so it is stored with the pupil and
         the teacher can see, point by point, what the level was built from. */
      try {
        const graded = marks.length
          ? await marksFromAnswers(topic, marks, transcript, questions)
          : null;
        if (graded) {
          v.level = graded.level;
          v.evidence = graded.evidence;
          v.marked = true;
          v.pointsHit = graded.hit;
          v.pointsTotal = graded.total;
          v.blanks = graded.blanks;
          v.qs = graded.qs;
          v.shown = graded.shown;
          /* Two graders write this one card: the read judged the pupil from the whole
             transcript, the count judged them point by point. The count sets the floor
             and the green cliff. The read may HOLD A PUPIL BACK - it spots wrong maths a
             keyword-count cannot - and may LIFT one to green only when they answered
             every question, so a child who left a question blank is never passed, and a
             child who showed the idea by an unusual route is not failed for one wording. */
          const rank = { red: 0, amber: 1, green: 2 };
          const readLevel = ['green', 'amber', 'red'].includes(readLevelRaw) ? readLevelRaw : null;
          /* A pupil who showed EVERY point on EVERY question has shown the understanding the check exists to measure. The read is a view of the whole transcript and can be swayed by one clumsy sentence, so it may NOT pull a full mark sheet down - a child who answered everything right must not be amber because the examiner misliked a phrase. Above the line the read still holds a pupil back. */
          if (readLevel && v.level !== 'green' && rank[readLevel] < rank[v.level]) v.level = readLevel;
          else if (readLevel === 'green' && v.level === 'amber' && graded.shown === graded.qs) v.level = 'green';
          if (/^\s*nothing\b/i.test(String(v.gets || '').trim()) && v.level !== 'red') {
            v.level = 'red';
            v.cappedBy = String(v.gets || '').trim().slice(0, 80);
          }
        } else if (!marks.length) {
          const perQ = await levelFromQuestions(topic, transcript);
          if (perQ) v.level = perQ;
        }
      } catch (e) { logError('/api/verdict grading', e.message); }
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
        .concat(['Checks done', 'Latest level', 'Shaky on', 'Next step']);
      const rows = names.map(n => {
        const cells = checks.map(s => { const st = find(s, n); return st ? ((st.verdict && st.verdict.level) || 'amber') : ''; });
        const verdicts = checks.map(s => find(s, n)).filter(st => st && st.verdict).map(st => st.verdict);
        const last = verdicts[verdicts.length - 1] || {};
        return [n].concat(cells).concat([verdicts.length, last.level || '', last.shaky || '', last.nextStep || '']);
      });
      const note = ['NOTE: AI guidance only - not a formal assessment or grade. A teacher must review this before it informs any decision.', '', '', ''];
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