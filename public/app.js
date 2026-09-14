// Get It? — client
const $ = (s) => document.querySelector(s);

// ----------------------------------------------------------------- plumbing
async function api(path, opts) {
  const r = await fetch(path, { credentials: 'same-origin', ...opts });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.error || 'Something went wrong.');
  return j;
}
function post(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function setMsg(el, text, ok) {
  el.textContent = text || '';
  el.classList.toggle('ok', !!ok);
}
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1900);
}
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); toast(label + ' copied'); }
  catch { toast('Press Ctrl+C to copy'); }
}
function when(ts) {
  const d = new Date(ts), now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today ' + time;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday ' + time;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + time;
}
function levelsOf(students) {
  const L = { green: 0, amber: 0, red: 0 };
  (students || []).forEach(st => {
    const l = (st.verdict && st.verdict.level) || 'amber';
    L[l] = (L[l] || 0) + 1;
  });
  return L;
}

// --------------------------------------------------------------------- tabs
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const t = btn.id === 'tab-teacher' ? 'teacher' : 'student';
    $('#view-teacher').classList.toggle('hidden', t !== 'teacher');
    $('#view-student').classList.toggle('hidden', t !== 'student');
  });
});

// =================================================================== TEACHER
// No login. Your classes live in this browser, so nothing is lost when the
// free server restarts. Only the live check itself sits on the server.
const LSKEY = 'getit.classes.v1';

let myClasses = readLocal();
let activeClass = null;
let activeCheckId = null;
let generated = [];
let resultFilter = 'all';
let pollTimer = null;

function readLocal() {
  try { const a = JSON.parse(localStorage.getItem(LSKEY)); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function writeLocal() { localStorage.setItem(LSKEY, JSON.stringify(myClasses)); }
function uid() { return Math.random().toString(36).slice(2, 10); }

function renderClasses() {
  if (!myClasses.length) {
    $('#classList').innerHTML = '<p class="muted">No classes yet. Add one below — it only takes a name.</p>';
    return;
  }
  $('#classList').innerHTML = myClasses.map(c =>
    `<div class="classrow${activeClass && activeClass.id === c.id ? ' on' : ''}" data-id="${esc(c.id)}">
       <strong>${esc(c.name)}</strong>
       <span class="small">${c.checks.length} check${c.checks.length === 1 ? '' : 's'}${c.code ? ' · code <b>' + esc(c.code) + '</b>' : ''}</span>
     </div>`
  ).join('');
  document.querySelectorAll('.classrow').forEach(row => {
    row.addEventListener('click', () => openClass(row.dataset.id));
  });
}

$('#btnAddClass').addEventListener('click', () => {
  setMsg($('#classMsg'), '');
  const name = $('#newClassName').value.trim();
  if (!name) return setMsg($('#classMsg'), 'Type a class name first.');
  const c = { id: uid(), name, code: '', key: '', checks: [] };
  myClasses.push(c);
  writeLocal();
  $('#newClassName').value = '';
  renderClasses();
  openClass(c.id);
});

$('#btnCloseClass').addEventListener('click', () => {
  stopPolling();
  activeClass = null;
  $('#classPanel').classList.add('hidden');
  renderClasses();
});

function openClass(id) {
  const c = myClasses.find(x => x.id === id);
  if (!c) return;
  stopPolling();
  activeClass = c;
  activeCheckId = c.checks.length ? c.checks[0].id : null;
  $('#classPanel').classList.remove('hidden');
  $('#classTitle').textContent = c.name;
  $('#classCode').textContent = c.code || '— — — —';
  $('#qwrap').classList.add('hidden');
  $('#btnCreateCheck').classList.add('hidden');
  $('#qlist').innerHTML = '';
  $('#results').innerHTML = '';
  $('#topic').value = '';
  $('#btnGenerate').textContent = '1. Generate questions';
  setMsg($('#checkMsg'), '');
  generated = [];
  $('#liveBar').classList.toggle('hidden', !c.checks.length);
  if (c.checks.length) $('#liveText').textContent = 'Latest check is live — students use code ' + c.code;
  renderClasses();
  renderChecks();
}

$('#btnCopyCode').addEventListener('click', () => {
  if (activeClass && activeClass.code) copy(activeClass.code, 'Class code');
  else toast('Make a check first');
});
$('#btnCopyLink').addEventListener('click', () => {
  if (activeClass && activeClass.code) copy(location.origin + '/?join=' + activeClass.code, 'Student link');
  else toast('Make a check first');
});
$('#btnOpenStudent').addEventListener('click', () => {
  if (activeClass && activeClass.code) window.open(location.origin + '/?join=' + activeClass.code, '_blank');
});

// --------------------------------------------------------- generate questions
$('#btnGenerate').addEventListener('click', async () => {
  setMsg($('#checkMsg'), '');
  const topic = $('#topic').value.trim();
  if (!topic) return setMsg($('#checkMsg'), 'Type what you taught first.');
  $('#btnGenerate').disabled = true;
  $('#btnGenerate').textContent = 'Writing questions...';
  try {
    const j = await post('/api/generate', { topic });
    generated = j.questions;
    renderQuestions();
    $('#qwrap').classList.remove('hidden');
    $('#btnCreateCheck').classList.remove('hidden');
    setMsg($('#checkMsg'), 'Edit anything you like, then create the check.', true);
  } catch (e) { setMsg($('#checkMsg'), e.message); }
  $('#btnGenerate').disabled = false;
  $('#btnGenerate').textContent = '1. Regenerate questions';
});

function renderQuestions() {
  $('#qlist').innerHTML = generated.map((q, i) =>
    `<div class="qrow" data-i="${i}">
       <span class="qnum">${i + 1}</span>
       <input class="qinput" value="${esc(q)}"/>
       <button class="small-btn qdel" data-tip="Remove this question.">✕</button>
     </div>`
  ).join('');
  document.querySelectorAll('.qdel').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.parentElement.dataset.i);
    syncInputs();
    generated.splice(i, 1);
    renderQuestions();
  }));
}

function syncInputs() {
  document.querySelectorAll('#qlist .qrow').forEach(row => {
    generated[Number(row.dataset.i)] = row.querySelector('.qinput').value.trim();
  });
}

$('#btnAddQ').addEventListener('click', () => {
  syncInputs();
  generated.push('');
  renderQuestions();
  const inputs = document.querySelectorAll('#qlist .qinput');
  if (inputs.length) inputs[inputs.length - 1].focus();
});

// ------------------------------------------------------------------ create
$('#btnCreateCheck').addEventListener('click', async () => {
  syncInputs();
  const questions = generated.map(q => String(q || '').trim()).filter(Boolean);
  setMsg($('#checkMsg'), '');
  if (!questions.length) return setMsg($('#checkMsg'), 'Add at least one question.');
  if (!activeClass) return setMsg($('#checkMsg'), 'Pick a class first.');
  $('#btnCreateCheck').disabled = true;
  try {
    const j = await post('/api/check', {
      code: activeClass.code, key: activeClass.key,
      name: activeClass.name, topic: $('#topic').value.trim(), questions
    });
    activeClass.code = j.code;
    activeClass.key = j.key;
    activeClass.checks.unshift({ id: j.checkId, topic: j.topic, questions: j.questions, createdAt: j.createdAt, snapshot: [] });
    writeLocal();

    $('#classCode').textContent = j.code;
    $('#qwrap').classList.add('hidden');
    $('#btnCreateCheck').classList.add('hidden');
    $('#topic').value = '';
    $('#btnGenerate').textContent = '1. Generate questions';
    generated = [];
    $('#liveText').textContent = 'Live now — students use code ' + j.code;
    $('#liveBar').classList.remove('hidden');
    setMsg($('#checkMsg'), '', true);
    renderClasses();
    activeCheckId = j.checkId;
    renderChecks();
    startPolling();
    loadLive();
  } catch (e) { setMsg($('#checkMsg'), e.message); }
  $('#btnCreateCheck').disabled = false;
});

// ------------------------------------------------------------- past checks
function renderChecks() {
  if (!activeClass) return;
  const checks = activeClass.checks;
  if (!checks.length) {
    $('#checkList').innerHTML = '<p class="muted">No checks yet. Make one above.</p>';
    return;
  }
  $('#checkList').innerHTML = checks.map((c, i) => {
    const snap = c.snapshot || [];
    const n = snap.length;
    const L = levelsOf(snap);
    const w = (v) => (n ? (v / n) * 100 : 0);
    const bar = n
      ? `<div class="cbar">
           <i class="g" style="width:${w(L.green)}%"></i>
           <i class="a" style="width:${w(L.amber)}%"></i>
           <i class="r" style="width:${w(L.red)}%"></i>
         </div>
         <div class="clegend"><b>${L.green}</b> got it &nbsp;·&nbsp; <b>${L.amber}</b> shaky &nbsp;·&nbsp; <b>${L.red}</b> struggling</div>`
      : `<div class="cbar"></div><div class="clegend">Nobody has finished yet</div>`;
    const qs = (c.questions || []).map(q => `<li>${esc(q)}</li>`).join('');
    return `<div class="checkcard${activeCheckId === c.id ? ' on' : ''}${i === 0 ? ' fresh' : ''}" data-id="${esc(c.id)}">
      <div class="chead">
        <div>
          <div class="ctitle">${i === 0 ? '<span class="pill">Latest</span>' : ''}${esc(c.topic)}</div>
          <div class="cmeta">${esc(when(c.createdAt))} &nbsp;·&nbsp; ${n} finished</div>
        </div>
        ${qs ? `<button class="small-btn cq" data-q="${esc(c.id)}">See the questions</button>` : ''}
      </div>
      ${bar}
      <div class="cqlist hidden" id="cq-${esc(c.id)}"><ol>${qs}</ol></div>
    </div>`;
  }).join('');

  document.querySelectorAll('.checkcard').forEach(card => {
    card.addEventListener('click', () => openCheck(card.dataset.id));
  });
  document.querySelectorAll('.cq').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const box = document.getElementById('cq-' + btn.dataset.q);
    if (!box) return;
    box.classList.toggle('hidden');
    btn.textContent = box.classList.contains('hidden') ? 'See the questions' : 'Hide the questions';
  }));
}

function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
function startPolling() {
  stopPolling();
  pollTimer = setInterval(loadLive, 12000);
}

function openCheck(id) {
  if (!activeClass) return;
  const ch = activeClass.checks.find(x => x.id === id);
  if (!ch) return;
  activeCheckId = id;
  resultFilter = 'all';
  renderChecks();

  const isLatest = activeClass.checks[0] && activeClass.checks[0].id === id;
  if (isLatest && activeClass.code && activeClass.key) {
    startPolling();
    loadLive();
  } else {
    stopPolling();
    drawResults(ch, ch.snapshot || [], false);
  }
}

async function loadLive() {
  if (!activeClass || !activeClass.code) return;
  const ch = activeClass.checks.find(x => x.id === activeCheckId);
  if (!ch) return;
  try {
    const j = await api('/api/results?code=' + encodeURIComponent(activeClass.code) + '&key=' + encodeURIComponent(activeClass.key));
    ch.snapshot = j.students || [];
    ch.questions = j.questions || ch.questions;
    writeLocal();
    drawResults(ch, ch.snapshot, true);
    renderChecks();
  } catch (e) {
    if (!ch.snapshot || !ch.snapshot.length) {
      $('#results').innerHTML = `<div class="card"><h3>${esc(ch.topic)}</h3><p class="muted">${esc(e.message)}</p></div>`;
    } else {
      drawResults(ch, ch.snapshot, false);
    }
  }
}

function drawResults(ch, students, live) {
  if (!students.length) {
    $('#results').innerHTML =
      `<div class="card"><h3>${esc(ch.topic)}</h3>
        <p class="muted">Nobody has finished yet. Give the class the code <b>${esc(activeClass.code)}</b> and leave this page open — it updates by itself.</p>
      </div>`;
    return;
  }

  const L = levelsOf(students);
  const order = { red: 0, amber: 1, green: 2 };
  const shown = students
    .filter(st => resultFilter === 'all' || ((st.verdict && st.verdict.level) || 'amber') !== 'green')
    .slice()
    .sort((a, b) => {
      const la = order[(a.verdict && a.verdict.level) || 'amber'] ?? 3;
      const lb = order[(b.verdict && b.verdict.level) || 'amber'] ?? 3;
      if (la !== lb) return la - lb;
      return String(a.name).localeCompare(String(b.name));
    });

  const rows = shown.map(st => {
    const v = st.verdict || {};
    const lv = v.level || 'amber';
    const tip = lv === 'green' ? 'Really understands it.'
              : lv === 'amber' ? 'Partly knows it, with clear gaps.'
              : 'Got little right — needs help.';
    return `<div class="sresult lv-${esc(lv)}">
      <div class="head"><span class="name">${esc(st.name)}</span><span class="tag lv-${esc(lv)}" data-tip="${esc(tip)}">${esc(lv)}</span></div>
      ${v.notes ? `<div class="notes">${esc(v.notes)}</div>` : ''}
      <div class="detail">
        ${v.gets ? `<div><span class="k" data-tip="What they truly understand.">Gets</span>${esc(v.gets)}</div>` : ''}
        ${v.shaky ? `<div><span class="k" data-tip="Where they are weak.">Shaky</span>${esc(v.shaky)}</div>` : ''}
        ${v.nextStep ? `<div class="nextstep"><span class="k" data-tip="One thing to do with them next.">Next</span>${esc(v.nextStep)}</div>` : ''}
        ${v.faked ? `<div class="warn" data-tip="Their answers sounded copied or AI-written.">Possible bluffing</div>` : ''}
      </div>
      ${st.transcript ? `<details class="transcript"><summary data-tip="Read the conversation word for word.">See their answers</summary><pre>${esc(st.transcript)}</pre></details>` : ''}
    </div>`;
  }).join('');

  const needHelp = L.amber + L.red;

  $('#results').innerHTML =
    `<div class="card">
       <div class="srow"><h3>${esc(ch.topic)}</h3><span class="small">${live ? 'updates live' : 'last looked ' + esc(when(ch.createdAt))}</span></div>
       <div class="stat-row">
         <div class="stat green" data-tip="Really understands it."><b>${L.green}</b><span>get it</span></div>
         <div class="stat amber" data-tip="Partly knows it, with clear gaps."><b>${L.amber}</b><span>shaky</span></div>
         <div class="stat red" data-tip="Got little right — needs help."><b>${L.red}</b><span>struggling</span></div>
       </div>
       <p class="summary"><b>${students.length}</b> finished · <b>${needHelp}</b> need${needHelp === 1 ? 's' : ''} a hand</p>
       ${live ? '' : '<p class="muted">Saved copy from when you last looked at it.</p>'}
       <div class="filters">
         <button data-f="all" class="${resultFilter === 'all' ? 'on' : ''}">Everyone (${students.length})</button>
         <button data-f="help" class="${resultFilter === 'help' ? 'on' : ''}">Needs help (${needHelp})</button>
       </div>
       ${rows || '<p class="muted">Nothing in this list.</p>'}
     </div>`;

  document.querySelectorAll('.filters button').forEach(b => b.addEventListener('click', () => {
    resultFilter = b.dataset.f;
    drawResults(ch, students, live);
  }));
}

renderClasses();

// =================================================================== STUDENT
let chat = { history: [], covered: 0, digs: 0, topic: '', questions: [], done: false, name: '', code: '' };
let sending = false;

$('#btnJoin').addEventListener('click', async () => {
  setMsg($('#joinMsg'), '');
  const code = $('#joinCode').value.trim().toLowerCase();
  const name = $('#studentName').value.trim();
  if (!code) return setMsg($('#joinMsg'), 'Enter the class code.');
  if (!name) return setMsg($('#joinMsg'), 'Enter your name.');
  $('#btnJoin').disabled = true;
  try {
    const j = await api('/api/join?code=' + encodeURIComponent(code));
    chat = {
      history: [], covered: 0, digs: 0,
      topic: j.check.topic,
      questions: j.check.questions || [],
      done: false, name, code
    };
    $('#joinCard').classList.add('hidden');
    $('#checkCard').classList.remove('hidden');
    const stick = document.querySelector('.row.stick');
    if (stick) stick.classList.remove('hidden');
    $('#checkTopic').textContent = j.check.topic;
    $('#chat').innerHTML = '';
    $('#progress').textContent = '';
    updateProgress();
    await nextTurn();
  } catch (e) {
    setMsg($('#joinMsg'), e.message);
  }
  $('#btnJoin').disabled = false;
});

function updateProgress() {
  const total = chat.questions.length;
  if (!total) { $('#progress').textContent = ''; return; }
  const n = Math.max(1, Math.min(chat.covered, total));
  $('#progress').textContent = `Question ${n} of ${total}`;
}

function addBubble(who, text) {
  const d = document.createElement('div');
  d.className = 'bubble ' + who;
  d.textContent = text;
  $('#chat').appendChild(d);
  d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return d;
}

async function nextTurn() {
  const typing = addBubble('examiner typing', '• • •');
  try {
    const j = await post('/api/chat', {
      topic: chat.topic, questions: chat.questions,
      history: chat.history, covered: chat.covered, digs: chat.digs
    });
    typing.remove();
    chat.history.push({ role: 'assistant', content: j.reply });
    chat.covered = j.covered;
    chat.digs = j.digs;
    addBubble('examiner', j.reply);
    updateProgress();
    if (j.done) {
      chat.done = true;
      await finish();
    } else {
      $('#answer').focus();
    }
  } catch (e) {
    typing.remove();
    addBubble('examiner', 'Sorry — something went wrong. Tell your teacher.');
    setMsg($('#chatMsg'), e.message);
  }
}

$('#btnSend').addEventListener('click', sendAnswer);
$('#answer').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendAnswer(); });

async function sendAnswer() {
  const text = $('#answer').value.trim();
  if (!text || chat.done || sending) return;
  sending = true;
  $('#answer').value = '';
  chat.history.push({ role: 'user', content: text });
  addBubble('student', text);
  $('#btnSend').disabled = true;
  await nextTurn();
  $('#btnSend').disabled = false;
  sending = false;
}

async function finish() {
  const transcript = chat.history
    .map(x => (x.role === 'user' ? 'Student: ' : 'Examiner: ') + x.content)
    .join('\n');
  $('#answer').disabled = true;
  $('#btnSend').disabled = true;
  $('#chatMsg').textContent = '';
  try {
    const j = await post('/api/verdict', { topic: chat.topic, transcript });
    await post('/api/result', { code: chat.code, name: chat.name, transcript, verdict: j.verdict });
  } catch (e) {
    setMsg($('#chatMsg'), 'Could not send to your teacher. Tell them before you close this.');
  }
  // Keep their answers on screen — just close off the conversation.
  const stick = document.querySelector('.row.stick');
  if (stick) stick.classList.add('hidden');
  $('#progress').textContent = 'Finished';
  const d = document.createElement('div');
  d.className = 'endline';
  d.textContent = '✓ All done — thanks! Your answers have gone to your teacher.';
  $('#chat').appendChild(d);
  d.scrollIntoView({ block: 'end', behavior: 'smooth' });
}

// ------------------------------------------------------------------- startup
(function () {
  const join = new URLSearchParams(location.search).get('join');
  if (join) {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    $('#tab-student').classList.add('active');
    $('#view-teacher').classList.add('hidden');
    $('#view-student').classList.remove('hidden');
    $('#joinCode').value = join.trim().toLowerCase();
    setTimeout(() => $('#studentName').focus(), 100);
  }
})();
